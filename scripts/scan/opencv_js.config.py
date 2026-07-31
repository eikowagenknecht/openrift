# Export whitelist for the scanner's trimmed OpenCV.js build (build-opencv.sh).
#
# Mirrors the injected surfaces in packages/shared/src/scan/detect-cv.ts
# (OpenCvLike) and orb.ts (OrbCvLike). Mat / vector types, geometry value
# helpers (Size, Rect, Scalar, RotatedRect, matFromArray) and CV_* constants
# are bound unconditionally by the core bindings and need no listing here.
#
# When the engine starts calling a new cv.* function, add it here and rebuild;
# a function missing from this list simply does not exist on the module.

core = {"": [], "Algorithm": []}

imgproc = {
    "": [
        "adaptiveThreshold",
        "contourArea",
        "cvtColor",
        "equalizeHist",
        "findContours",
        "GaussianBlur",
        "getStructuringElement",
        "medianBlur",
        "minAreaRect",
        "morphologyEx",
        "resize",
        "threshold",
    ]
}

features2d = {
    "Feature2D": [
        "detect",
        "compute",
        "detectAndCompute",
        "descriptorSize",
        "descriptorType",
        "defaultNorm",
        "empty",
        "getDefaultName",
    ],
    "ORB": ["create", "setMaxFeatures"],
    "DescriptorMatcher": ["match", "knnMatch", "create"],
    "BFMatcher": ["isMaskSupported", "create"],
}

calib3d = {"": ["findHomography"], "UsacParams": ["UsacParams"]}

white_list = makeWhiteList([core, imgproc, features2d, calib3d])  # noqa: F821
