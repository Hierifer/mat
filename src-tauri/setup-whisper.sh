#!/bin/bash
# Setup script for Whisper speech recognition

# Create models directory
mkdir -p models

# Download Whisper base model (74MB)
if [ ! -f "models/ggml-base.bin" ]; then
    echo "Downloading Whisper base model..."
    curl -L "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin" -o "models/ggml-base.bin"
    echo "✅ Whisper model downloaded successfully"
else
    echo "✅ Whisper model already exists"
fi

# Set environment variables for building
export WHISPER_DONT_GENERATE_BINDINGS=1
export WHISPER_NO_AVX=1
export WHISPER_NO_AVX2=1
export WHISPER_NO_FMA=1
export WHISPER_NO_F16C=1

echo ""
echo "To build the project, use:"
echo "  WHISPER_DONT_GENERATE_BINDINGS=1 WHISPER_NO_AVX=1 WHISPER_NO_AVX2=1 WHISPER_NO_FMA=1 WHISPER_NO_F16C=1 cargo build"
echo ""
echo "Or add these to your .bashrc/.zshrc:"
echo "  export WHISPER_DONT_GENERATE_BINDINGS=1"
echo "  export WHISPER_NO_AVX=1"
echo "  export WHISPER_NO_AVX2=1"
echo "  export WHISPER_NO_FMA=1"
echo "  export WHISPER_NO_F16C=1"
