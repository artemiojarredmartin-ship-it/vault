// Encodes the rendered PNG frames into the web intro videos with exact per-frame timing.
// (Blender's VSE encoder retimed the frames and dropped the end of the animation.)
// Run: swift blender/encode.swift <frames dir> <out.mp4> <width> <height> <bitrate Mbps>
import AVFoundation
import CoreGraphics
import ImageIO
import Foundation

let a = CommandLine.arguments
guard a.count == 6 else { print("usage: encode.swift framesDir out.mp4 w h mbps"); exit(1) }
let dir = URL(fileURLWithPath: a[1]), out = URL(fileURLWithPath: a[2])
let W = Int(a[3])!, H = Int(a[4])!, mbps = Double(a[5])!
let files = try FileManager.default.contentsOfDirectory(atPath: dir.path).filter { $0.hasSuffix(".png") }.sorted()
try? FileManager.default.removeItem(at: out)

let writer = try AVAssetWriter(outputURL: out, fileType: .mp4)
let input = AVAssetWriterInput(mediaType: .video, outputSettings: [
  AVVideoCodecKey: AVVideoCodecType.h264, AVVideoWidthKey: W, AVVideoHeightKey: H,
  AVVideoCompressionPropertiesKey: [
    AVVideoAverageBitRateKey: mbps * 1_000_000, AVVideoMaxKeyFrameIntervalKey: 15,
    AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel, AVVideoAllowFrameReorderingKey: false,
  ] as [String: Any],
  AVVideoColorPropertiesKey: [AVVideoColorPrimariesKey: AVVideoColorPrimaries_ITU_R_709_2,
    AVVideoTransferFunctionKey: AVVideoTransferFunction_ITU_R_709_2, AVVideoYCbCrMatrixKey: AVVideoYCbCrMatrix_ITU_R_709_2],
])
input.expectsMediaDataInRealTime = false
let adaptor = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: input, sourcePixelBufferAttributes: [
  kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA, kCVPixelBufferWidthKey as String: W, kCVPixelBufferHeightKey as String: H])
writer.add(input)
writer.startWriting(); writer.startSession(atSourceTime: .zero)
let srgb = CGColorSpace(name: CGColorSpace.sRGB)!
for (i, f) in files.enumerated() {
  let src = CGImageSourceCreateWithURL(dir.appendingPathComponent(f) as CFURL, nil)!
  let img = CGImageSourceCreateImageAtIndex(src, 0, nil)!
  var pb: CVPixelBuffer?
  CVPixelBufferPoolCreatePixelBuffer(nil, adaptor.pixelBufferPool!, &pb)
  let buf = pb!
  CVPixelBufferLockBaseAddress(buf, [])
  let ctx = CGContext(data: CVPixelBufferGetBaseAddress(buf), width: W, height: H, bitsPerComponent: 8,
    bytesPerRow: CVPixelBufferGetBytesPerRow(buf), space: srgb,
    bitmapInfo: CGImageAlphaInfo.noneSkipFirst.rawValue | CGBitmapInfo.byteOrder32Little.rawValue)!
  ctx.interpolationQuality = .high
  ctx.draw(img, in: CGRect(x: 0, y: 0, width: W, height: H))
  CVPixelBufferUnlockBaseAddress(buf, [])
  while !input.isReadyForMoreMediaData { usleep(2000) }
  adaptor.append(buf, withPresentationTime: CMTime(value: CMTimeValue(i), timescale: 30))
}
input.markAsFinished()
writer.endSession(atSourceTime: CMTime(value: CMTimeValue(files.count), timescale: 30))
let sem = DispatchSemaphore(value: 0)
writer.finishWriting { sem.signal() }
sem.wait()
print("ENCODED \(files.count) frames -> \(out.lastPathComponent) status \(writer.status.rawValue) \(writer.error?.localizedDescription ?? "")")
