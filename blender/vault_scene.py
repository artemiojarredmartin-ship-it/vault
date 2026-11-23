"""Vault hero scene — built entirely from code so it can be tweaked and re-rendered.

Run (no Blender UI needed):
  /Applications/Blender.app/Contents/MacOS/Blender -b -P blender/vault_scene.py -- --out blender/renders/test.png [--samples 128] [--pct 100] [--save]

Look: matte-black vault dial with a brushed-titanium bezel and handle wheel, a stack of
black chips with silver inserts and one floating chip, lit like a studio product shot.
"""
import bpy, math, sys, os
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
def arg(name, default):
    return argv[argv.index(name) + 1] if name in argv else default
OUT = os.path.abspath(arg('--out', 'blender/renders/test.png'))
SAMPLES = int(arg('--samples', '128'))
PCT = int(arg('--pct', '100'))
SAVE = '--save' in argv
ANIM = '--anim' in argv                 # render the whole sequence
FRAME = int(arg('--frame', '0'))         # or preview one frame of it
FRAMES = 96

# ---------- reset ----------
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene

def lin(hexstr):
    h = hexstr.lstrip('#'); c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return [x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c] + [1.0]

def setin(node, name, value):
    if name in node.inputs:
        node.inputs[name].default_value = value

# ---------- materials ----------
def principled(name, color, rough, metal=0.0, coat=0.0, coat_rough=0.3, aniso=0.0, noise_bump=0.0):
    m = bpy.data.materials.new(name); m.use_nodes = True
    nt = m.node_tree; p = nt.nodes['Principled BSDF']
    setin(p, 'Base Color', lin(color)); setin(p, 'Roughness', rough); setin(p, 'Metallic', metal)
    setin(p, 'Coat Weight', coat); setin(p, 'Coat Roughness', coat_rough)
    setin(p, 'Anisotropic', aniso)
    if noise_bump > 0:  # micro surface grain, so nothing looks CG-perfect
        tex = nt.nodes.new('ShaderNodeTexNoise'); setin(tex, 'Scale', 900.0); setin(tex, 'Detail', 2.0)
        bump = nt.nodes.new('ShaderNodeBump'); setin(bump, 'Strength', noise_bump); setin(bump, 'Distance', 0.002)
        nt.links.new(tex.outputs['Fac'], bump.inputs['Height']); nt.links.new(bump.outputs['Normal'], p.inputs['Normal'])
        # tiny roughness variation
        rmap = nt.nodes.new('ShaderNodeMapRange'); setin(rmap, 'To Min', rough * 0.85); setin(rmap, 'To Max', rough * 1.15)
        nt.links.new(tex.outputs['Fac'], rmap.inputs['Value']); nt.links.new(rmap.outputs['Result'], p.inputs['Roughness'])
    return m

M_BLACK = principled('MatteBlack', '#0c0d0f', 0.48, coat=0.35, coat_rough=0.35, noise_bump=0.15)
M_CHIP = principled('ChipBlack', '#0e0f11', 0.38, coat=0.6, coat_rough=0.22, noise_bump=0.08)
M_TI = principled('Titanium', '#c2c7ce', 0.27, metal=1.0, aniso=0.6, noise_bump=0.05)
M_TI_DARK = principled('TitaniumDark', '#5a5f66', 0.32, metal=1.0, aniso=0.4)
M_INSERT = principled('ChipInsert', '#9298a0', 0.38, metal=1.0, aniso=0.5, noise_bump=0.05)
M_FLOOR = principled('Floor', '#07080a', 0.4, coat=0.15, coat_rough=0.3, noise_bump=0.05)

# ---------- helpers ----------
def smooth(obj, bevel=0.0, segs=4):
    if bevel > 0:
        mod = obj.modifiers.new('Bevel', 'BEVEL'); mod.width = bevel; mod.segments = segs; mod.limit_method = 'ANGLE'
    bpy.context.view_layer.objects.active = obj; obj.select_set(True)
    try: bpy.ops.object.shade_smooth_by_angle(angle=math.radians(35))
    except Exception:
        try: bpy.ops.object.shade_auto_smooth(angle=math.radians(35))
        except Exception: bpy.ops.object.shade_smooth()
    obj.select_set(False)
    return obj

def mat(obj, m):
    obj.data.materials.clear(); obj.data.materials.append(m); return obj

def parent(child, par):
    child.parent = par; return child

def empty(name, loc=(0, 0, 0)):
    e = bpy.data.objects.new(name, None); scene.collection.objects.link(e); e.location = loc; return e

def cyl(r, h, verts=128, loc=(0, 0, 0)):
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=h, location=loc); return bpy.context.active_object

def torus(R, r, loc=(0, 0, 0), maj=192, minr=24):
    bpy.ops.mesh.primitive_torus_add(major_radius=R, minor_radius=r, major_segments=maj, minor_segments=minr, location=loc); return bpy.context.active_object

def box(sx, sy, sz, loc=(0, 0, 0), rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot); o = bpy.context.active_object; o.scale = (sx, sy, sz)
    bpy.ops.object.transform_apply(scale=True); return o

# ---------- chip (a collection we can instance) ----------
chip_col = bpy.data.collections.new('Chip'); scene.collection.children.link(chip_col)
def to_chip(o):
    for c in o.users_collection: c.objects.unlink(o)
    chip_col.objects.link(o); return o

R, H = 0.62, 0.12
body = to_chip(smooth(mat(cyl(R, H), M_CHIP), bevel=0.014))
for i in range(8):  # edge inserts: wrap over the rim like a real casino chip
    a = i / 8 * math.tau
    side = to_chip(smooth(mat(box(0.15, 0.012, H * 0.86, loc=(math.cos(a) * (R - 0.004), math.sin(a) * (R - 0.004), 0), rot=(0, 0, a + math.pi / 2)), M_INSERT), bevel=0.003, segs=2))
    for z in (H / 2 - 0.0015, -H / 2 + 0.0015):
        cap = to_chip(smooth(mat(box(0.13, 0.07, 0.004, loc=(math.cos(a) * (R - 0.05), math.sin(a) * (R - 0.05), z), rot=(0, 0, a + math.pi / 2)), M_INSERT), bevel=0.0015, segs=2))
for z in (H / 2 - 0.001, -H / 2 + 0.001):  # inlaid rings + vault mark
    to_chip(smooth(mat(torus(0.44, 0.0045, loc=(0, 0, z), minr=12), M_INSERT)))
    to_chip(smooth(mat(torus(0.15, 0.007, loc=(0, 0, z), minr=12), M_INSERT)))
    to_chip(smooth(mat(cyl(0.035, 0.004, verts=48, loc=(0, 0, z)), M_INSERT)))
chip_col.hide_render = False
# keep the source chip out of the shot
for o in chip_col.objects: o.hide_render = False
src_layer = bpy.context.view_layer.layer_collection.children['Chip']; src_layer.exclude = True

def chip_instance(name, loc, rot=(0, 0, 0)):
    inst = bpy.data.objects.new(name, None); inst.instance_type = 'COLLECTION'; inst.instance_collection = chip_col
    inst.location = loc; inst.rotation_euler = rot; scene.collection.objects.link(inst); return inst

# ---------- vault dial ----------
dial = empty('Dial', (-0.15, -0.9, 0.25))
dial.rotation_euler = (math.radians(90 - 3), 0, math.radians(18))
door = parent(smooth(mat(cyl(1.25, 0.24), M_BLACK), bevel=0.035), dial)
parent(smooth(mat(torus(1.29, 0.075, loc=(0, 0, 0.1)), M_TI)), dial)
parent(smooth(mat(torus(1.2, 0.012, loc=(0, 0, 0.125), minr=12), M_TI)), dial)
parent(smooth(mat(torus(0.96, 0.01, loc=(0, 0, 0.122), minr=12), M_TI)), dial)
ticks = empty('Ticks'); parent(ticks, dial)
for i in range(60):
    big = i % 5 == 0; a = i / 60 * math.tau; rr = 1.095 if big else 1.12
    t = box(0.026 if big else 0.012, 0.13 if big else 0.065, 0.012, loc=(math.sin(a) * rr, math.cos(a) * rr, 0.123), rot=(0, 0, -a))
    parent(mat(t, M_TI), ticks)
handle = empty('Handle'); parent(handle, dial)
bpy.ops.mesh.primitive_cone_add(vertices=96, radius1=0.3, radius2=0.25, depth=0.22, location=(0, 0, 0.23))
parent(smooth(mat(bpy.context.active_object, M_TI), bevel=0.02), handle)
parent(smooth(mat(cyl(0.15, 0.04, verts=64, loc=(0, 0, 0.345)), M_TI_DARK), bevel=0.008), handle)
for i in range(3):
    a = i / 3 * math.tau + math.radians(15)
    d = Vector((math.sin(a), math.cos(a), 0))
    bpy.ops.mesh.primitive_cylinder_add(vertices=48, radius=0.038, depth=0.68, location=tuple(d * 0.52 + Vector((0, 0, 0.3))))
    sp = bpy.context.active_object; sp.rotation_euler = (math.radians(90), 0, -a)
    parent(smooth(mat(sp, M_TI)), handle)
    bpy.ops.mesh.primitive_uv_sphere_add(segments=64, ring_count=32, radius=0.078, location=tuple(d * 0.9 + Vector((0, 0, 0.3))))
    parent(smooth(mat(bpy.context.active_object, M_TI)), handle)

# ---------- chips ----------
import random
random.seed(7)
FLOOR_Z = -1.18
for i in range(6):
    chip_instance(f'Stack{i}', (1.3 + random.uniform(-0.02, 0.02), -1.35 + random.uniform(-0.02, 0.02), FLOOR_Z + H / 2 + i * (H + 0.002)),
                  (random.uniform(-0.006, 0.006), random.uniform(-0.006, 0.006), random.uniform(0, math.tau)))
hero = chip_instance('HeroChip', (1.75, -1.85, 0.55), (math.radians(52), math.radians(-28), math.radians(42)))

# ---------- floor ----------
# studio sweep: floor curves up into the back wall, so there is no horizon line
import bmesh
me = bpy.data.meshes.new('Sweep'); bm = bmesh.new()
prof = []
for i in range(0, 25): prof.append((-14 + i * 0.75, FLOOR_Z))          # floor, front to back
for i in range(1, 25):                                                  # quarter-circle bend, radius 5
    a = i / 24 * (math.pi / 2); prof.append((4 + math.sin(a) * 5, FLOOR_Z + 5 - math.cos(a) * 5))
for i in range(1, 8): prof.append((9, FLOOR_Z + 5 + i * 1.5))          # back wall
rows = []
for x in (-18, 18):
    rows.append([bm.verts.new((x, y, z)) for (y, z) in prof])
for j in range(len(prof) - 1):
    bm.faces.new((rows[0][j], rows[1][j], rows[1][j + 1], rows[0][j + 1]))
bm.to_mesh(me); bm.free()
sweep = bpy.data.objects.new('Sweep', me); scene.collection.objects.link(sweep); smooth(mat(sweep, M_FLOOR))

# ---------- lighting: studio softboxes ----------
def area(name, loc, rot, size, power, color='#ffffff', shape='RECTANGLE', size_y=None):
    l = bpy.data.lights.new(name, 'AREA'); l.energy = power; l.color = lin(color)[:3]; l.shape = shape
    l.size = size; l.size_y = size_y or size
    o = bpy.data.objects.new(name, l); scene.collection.objects.link(o); o.location = loc; o.rotation_euler = rot; return o
def aim(o, target):
    o.rotation_euler = (Vector(target) - o.location).to_track_quat('-Z', 'Y').to_euler()
key = area('Key', (1.6, -3.2, 5.0), (0, 0, 0), 4.0, 900, '#f4f6fa', size_y=2.0); aim(key, (0.4, -0.6, -0.4))
rim = area('Rim', (-3.5, 3.0, 3.0), (0, 0, 0), 1.0, 550, '#dfe7f2', size_y=5.0); aim(rim, (0.2, -0.6, 0))
rim2 = area('Rim2', (4.5, 2.5, 2.5), (0, 0, 0), 0.8, 380, '#e6ebf2', size_y=4.0); aim(rim2, (1.0, -0.6, -0.4))
fill = area('Fill', (-4.0, -6.0, 1.0), (0, 0, 0), 6.0, 60, '#cfd6df'); aim(fill, (0.3, -0.6, 0))

# world: almost black for lighting, but the camera sees the page colour (#121417)
w = bpy.data.worlds.new('World'); scene.world = w; w.use_nodes = True
nt = w.node_tree; nt.nodes.clear()
out = nt.nodes.new('ShaderNodeOutputWorld'); mix = nt.nodes.new('ShaderNodeMixShader'); lp = nt.nodes.new('ShaderNodeLightPath')
b_dark = nt.nodes.new('ShaderNodeBackground'); b_dark.inputs['Color'].default_value = lin('#050506'); b_dark.inputs['Strength'].default_value = 1.0
b_cam = nt.nodes.new('ShaderNodeBackground'); b_cam.inputs['Color'].default_value = lin('#121417'); b_cam.inputs['Strength'].default_value = 1.0
nt.links.new(lp.outputs['Is Camera Ray'], mix.inputs['Fac']); nt.links.new(b_dark.outputs[0], mix.inputs[1]); nt.links.new(b_cam.outputs[0], mix.inputs[2])
nt.links.new(mix.outputs[0], out.inputs['Surface'])

# ---------- camera ----------
cam_data = bpy.data.cameras.new('Cam'); cam_data.lens = 62
cam = bpy.data.objects.new('Cam', cam_data); scene.collection.objects.link(cam); scene.camera = cam
cam.location = (1.1, -12.8, 1.7)
cam_target = empty('CamTarget', (0.55, -0.6, -0.1))
tc = cam.constraints.new('TRACK_TO'); tc.target = cam_target; tc.track_axis = 'TRACK_NEGATIVE_Z'; tc.up_axis = 'UP_Y'
cam_data.dof.use_dof = True; cam_data.dof.focus_object = hero; cam_data.dof.aperture_fstop = 4.0

# ---------- animation: darkness → light sweep → unlock → reveal ----------
stack = [o for o in scene.objects if o.name.startswith('Stack')]
def k(obj, path, frame, value, index=-1):
    if index >= 0: getattr(obj, path)[index] = value
    else: setattr(obj, path, value)
    obj.keyframe_insert(data_path=path, frame=frame, index=index)
if ANIM or FRAME:
    scene.frame_start, scene.frame_end = 1, FRAMES
    # lights fade up and the key light glides across the metal
    for light, lo, hi in ((key, 40, 900), (rim, 0, 550), (rim2, 0, 380), (fill, 6, 60)):
        k(light.data, 'energy', 1, lo); k(light.data, 'energy', 30, hi)
    k(key, 'location', 1, -2.6, 0); k(key, 'location', 42, 1.6, 0)
    # dial ring spins and settles, then the handle wheel turns a quarter
    k(ticks, 'rotation_euler', 1, -math.tau * 1.25, 2); k(ticks, 'rotation_euler', 38, 0.0, 2)
    k(handle, 'rotation_euler', 40, 0.0, 2); k(handle, 'rotation_euler', 56, math.pi / 2, 2)
    # camera: close on the dial, then glides back to the wide shot
    for f, loc, tgt in ((1, (-0.55, -5.2, 0.85), (-0.15, -0.9, 0.22)), (40, (-0.35, -6.6, 1.05), (-0.05, -0.85, 0.15)), (FRAMES, (1.1, -12.8, 1.7), (0.55, -0.6, -0.1))):
        cam.location = loc; cam.keyframe_insert('location', frame=f)
        cam_target.location = tgt; cam_target.keyframe_insert('location', frame=f)
    # chips drop onto the stack one by one, then the hero chip descends
    for i, c in enumerate(stack):
        rest = c.location.z; f0 = 50 + i * 4
        k(c, 'location', 1, rest + 4.5, 2); k(c, 'location', f0, rest + 4.5, 2); k(c, 'location', f0 + 11, rest, 2)
    hr = tuple(hero.rotation_euler); hz = hero.location.z
    k(hero, 'location', 1, hz + 4.0, 2); k(hero, 'location', 62, hz + 4.0, 2); k(hero, 'location', FRAMES - 4, hz, 2)
    hero.rotation_euler = (hr[0] + 0.5, hr[1], hr[2] + 2.2); hero.keyframe_insert('rotation_euler', frame=62)
    hero.rotation_euler = hr; hero.keyframe_insert('rotation_euler', frame=FRAMES - 4)
    # landing feel: ease out on drops
    for o in [ticks, handle, hero] + stack:
        if o.animation_data and o.animation_data.action:
            try:
                for fc in o.animation_data.action.fcurves:
                    for kp in fc.keyframe_points: kp.interpolation = 'BEZIER'; kp.easing = 'EASE_OUT'
            except Exception: pass

# ---------- collision check: no chip may pass through the vault door ----------
if '--check' in argv:
    from mathutils.bvhtree import BVHTree
    def world_bvh(mesh_obj, mat):
        me = mesh_obj.data
        verts = [mat @ v.co for v in me.vertices]
        return BVHTree.FromPolygons(verts, [tuple(p.vertices) for p in me.polygons])
    dial_parts = [o for o in scene.objects if o.type == 'MESH' and o.parent and (o.parent == dial or o.parent.parent == dial or (o.parent.parent and o.parent.parent.parent == dial))]
    hits = []
    for f in range(1, FRAMES + 1):
        scene.frame_set(f)
        dg = bpy.context.evaluated_depsgraph_get()
        dial_trees = [world_bvh(o, o.matrix_world) for o in dial_parts]
        for inst in dg.object_instances:
            if not inst.is_instance or inst.object.type != 'MESH': continue
            owner = inst.parent.original.name if inst.parent else '?'
            t = world_bvh(inst.object.original, inst.matrix_world.copy())
            if any(t.overlap(d) for d in dial_trees):
                hits.append((f, owner)); break
    print('CHECK', 'CLEAR' if not hits else 'HITS ' + str(sorted(set(hits))[:40]))
    sys.exit(0)

# ---------- render ----------
scene.render.engine = 'CYCLES'
try:
    prefs = bpy.context.preferences.addons['cycles'].preferences
    prefs.compute_device_type = 'METAL'; prefs.get_devices()
    for d in prefs.devices: d.use = True
    scene.cycles.device = 'GPU'
except Exception as e:
    print('GPU setup failed, using CPU', e)
scene.cycles.samples = SAMPLES
scene.cycles.use_adaptive_sampling = True
scene.cycles.use_denoising = True
scene.render.resolution_x, scene.render.resolution_y, scene.render.resolution_percentage = 1600, 1000, PCT
for vt, look in (('AgX', 'AgX - Medium High Contrast'), ('AgX', 'Medium High Contrast'), ('Filmic', 'Medium High Contrast')):
    try:
        scene.view_settings.view_transform = vt
        try: scene.view_settings.look = look
        except Exception: pass
        break
    except Exception: continue
scene.render.film_transparent = False
scene.render.image_settings.file_format = 'PNG'
os.makedirs(os.path.dirname(OUT), exist_ok=True)
scene.render.filepath = OUT
if SAVE:
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(os.path.dirname(__file__), 'vault_hero.blend'))
if ANIM:
    scene.render.image_settings.file_format = 'JPEG'; scene.render.image_settings.quality = 78
    scene.render.filepath = os.path.join(os.path.dirname(OUT), '')
    bpy.ops.render.render(animation=True)
else:
    if FRAME: scene.frame_set(FRAME)
    bpy.ops.render.render(write_still=True)
print('RENDERED', OUT)
