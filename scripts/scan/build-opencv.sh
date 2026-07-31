#!/usr/bin/env bash
# Build the scanner's trimmed OpenCV.js.
#
# The stock @techstark/opencv-js dist is a 10.8 MB single-file build carrying
# dnn, photo, video and objdetect, none of which the engine touches. This build
# compiles only core + imgproc + features2d + calib3d (plus flann, a features2d
# link dependency), exports only the functions in opencv_js.config.py, enables
# WASM SIMD (our browser floor, Safari/iOS 16.4, supports it), and splits the
# .js glue from the .wasm so browsers can cache the compiled machine code
# (--disable_single_file).
#
# Needs docker; the OpenCV source is cloned on first run. Outputs land in
#   data/image-recognition-test/models/opencv/opencv.js + opencv_js.wasm
# which export-index.ts and run-clips.ts pick up. The emscripten file names
# stay as built: under Bun/Node the glue resolves opencv_js.wasm next to
# itself, which is what lets run-clips require() it directly; export-index
# renames to the scan-opencv.js/.wasm serving convention. Not committed.
#
# Usage: bash scripts/scan/build-opencv.sh [--clean]
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
BUILD_ROOT="$REPO_ROOT/data/opencv-build"
SRC_DIR="$BUILD_ROOT/opencv"
OUT_DIR="$BUILD_ROOT/build_js"
DEST_DIR="$REPO_ROOT/data/image-recognition-test/models/opencv"
OPENCV_VERSION="4.12.0"
# The image the OpenCV docs recommend for js builds; override via env if a
# specific emsdk release is ever needed.
IMAGE="${OPENCV_EMSDK_IMAGE:-emscripten/emsdk}"

if [ ! -d "$SRC_DIR" ]; then
  git clone --depth 1 --branch "$OPENCV_VERSION" \
    https://github.com/opencv/opencv.git "$SRC_DIR"
fi

# Two patches to modules/js/CMakeLists.txt for current emsdk; both no-ops once
# applied. The hardcoded -std=c++11 (add_definitions) lands after
# CMAKE_CXX_STANDARD's flag on the compile line and breaks embind, whose
# headers require C++17. DEMANGLE_SUPPORT was removed in emscripten 4.x and
# aborts the link.
sed -i 's/add_definitions("-std=c++11")/add_definitions("-std=c++17")/' \
  "$SRC_DIR/modules/js/CMakeLists.txt"
sed -i 's/ -s DEMANGLE_SUPPORT=1//' "$SRC_DIR/modules/js/CMakeLists.txt"

if [ "${1:-}" = "--clean" ]; then
  rm -rf "$OUT_DIR"
fi
mkdir -p "$OUT_DIR"

docker run --rm -u "$(id -u):$(id -g)" \
  -v "$BUILD_ROOT:/src" \
  -v "$REPO_ROOT/scripts/scan/opencv_js.config.py:/src/opencv_js.config.py:ro" \
  --workdir /src \
  "$IMAGE" \
  emcmake python3 /src/opencv/platforms/js/build_js.py /src/build_js \
  --opencv_dir /src/opencv \
  --build_wasm --simd --disable_single_file \
  --config /src/opencv_js.config.py \
  `# current emsdk's embind headers refuse OpenCV's default -std=c++11` \
  -DCMAKE_CXX_STANDARD=17 \
  -DBUILD_opencv_dnn=OFF \
  -DBUILD_opencv_photo=OFF \
  -DBUILD_opencv_video=OFF \
  -DBUILD_opencv_objdetect=OFF \
  -DBUILD_TESTS=OFF \
  -DBUILD_PERF_TESTS=OFF \
  -DBUILD_EXAMPLES=OFF

mkdir -p "$DEST_DIR"
rm -f "$DEST_DIR/scan-opencv.js" "$DEST_DIR/scan-opencv.wasm"
cp "$OUT_DIR/bin/opencv.js" "$DEST_DIR/opencv.js"
cp "$OUT_DIR/bin/opencv_js.wasm" "$DEST_DIR/opencv_js.wasm"
ls -la "$DEST_DIR"
