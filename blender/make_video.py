"""Stitch the rendered PNG frames into the web intro video + the home hero still.
Run: /Applications/Blender.app/Contents/MacOS/Blender -b -P blender/make_video.py
"""
import bpy, os
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
src = os.path.join(root, 'blender', 'renders', 'seq')
files = sorted(f for f in os.listdir(src) if f.endswith('.png'))
def encode(out, w, h):
    sc = bpy.context.scene
    if sc.sequence_editor: bpy.ops.sequencer.select_all(action='SELECT') if False else None
    sc.sequence_editor_clear() if hasattr(sc, 'sequence_editor_clear') else None
    sc.sequence_editor_create()
    coll = sc.sequence_editor.strips if hasattr(sc.sequence_editor, 'strips') else sc.sequence_editor.sequences
    for st in list(coll): coll.remove(st)
    strip = coll.new_image('frames', os.path.join(src, files[0]), 1, 1)
    for f in files[1:]: strip.elements.append(f)
    sc.frame_start, sc.frame_end = 1, len(files)
    sc.render.fps = 30
    sc.render.resolution_x, sc.render.resolution_y, sc.render.resolution_percentage = w, h, 100
    s = sc.render.image_settings
    try: s.media_type = 'VIDEO'
    except Exception: pass
    s.file_format = 'FFMPEG'
    sc.render.ffmpeg.format = 'MPEG4'; sc.render.ffmpeg.codec = 'H264'
    sc.render.ffmpeg.constant_rate_factor = 'HIGH'; sc.render.ffmpeg.ffmpeg_preset = 'BEST'
    sc.render.ffmpeg.gopsize = 15
    sc.render.filepath = out
    bpy.ops.render.render(animation=True)
    print('VIDEO', out)
hero = os.path.join(root, 'assets', 'hero')
encode(os.path.join(hero, 'intro-4k.mp4'), 3840, 2160)
encode(os.path.join(hero, 'intro-1080.mp4'), 1920, 1080)
