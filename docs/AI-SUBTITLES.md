# Local AI subtitles on Windows

Onyx can generate English WebVTT subtitles for prerecorded media by running
[`whisper.cpp`](https://github.com/ggml-org/whisper.cpp) locally. Video and
audio are not uploaded to an external service.

Onyx does not currently install whisper.cpp or download a model automatically.
Complete this setup once on the Windows computer that runs the Onyx server.

## Recommended setup for the GTX 1660 Ti

- Backend: whisper.cpp built with CUDA
- Model: `ggml-medium.en-q5_0.bin`
- Language: English
- Caption filename: `<video name>.en.ai.vtt`

The quantized medium English model is approximately 539 MB. If it is too slow,
use `ggml-small.en-q5_1.bin` instead. The model can be changed later without
rebuilding Onyx.

## 1. Check the NVIDIA driver

Open PowerShell and run:

```powershell
nvidia-smi
```

The command should display the GTX 1660 Ti and its driver. If the command is
missing or reports an error, install the current NVIDIA driver before
continuing.

## 2. Install the build requirements

Install:

1. [Git for Windows](https://git-scm.com/download/win)
2. [CMake](https://cmake.org/download/) and enable its **Add CMake to PATH** option
3. [Visual Studio 2022 Build Tools](https://visualstudio.microsoft.com/downloads/)
4. In the Build Tools installer, select **Desktop development with C++**
5. [NVIDIA CUDA Toolkit](https://developer.nvidia.com/cuda-downloads)

Restart Windows after installing CUDA. Then open a new PowerShell window and
verify:

```powershell
git --version
cmake --version
nvcc --version
```

## 3. Build whisper.cpp with CUDA

Use a short folder path without spaces:

```powershell
New-Item -ItemType Directory -Force C:\OnyxTools | Out-Null
Set-Location C:\OnyxTools
git clone https://github.com/ggml-org/whisper.cpp.git
Set-Location .\whisper.cpp
cmake -B build -DGGML_CUDA=ON
cmake --build build --config Release -j
```

The executable should be created at:

```text
C:\OnyxTools\whisper.cpp\build\bin\Release\whisper-cli.exe
```

Keep the DLL files in that same folder. Do not move only the executable to a
different directory.

If CMake cannot find the compiler, run the commands from **Developer
PowerShell for VS 2022** instead of ordinary PowerShell.

## 4. Download the model

From the `C:\OnyxTools\whisper.cpp` folder:

```powershell
New-Item -ItemType Directory -Force .\models | Out-Null
Invoke-WebRequest `
  -Uri "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-medium.en-q5_0.bin" `
  -OutFile ".\models\ggml-medium.en-q5_0.bin"
```

The resulting model path is:

```text
C:\OnyxTools\whisper.cpp\models\ggml-medium.en-q5_0.bin
```

Official converted models are listed in the
[`whisper.cpp` model repository](https://huggingface.co/ggerganov/whisper.cpp/tree/main).

## 5. Test whisper.cpp before using Onyx

The repository includes a short test recording. Run:

```powershell
& ".\build\bin\Release\whisper-cli.exe" `
  -m ".\models\ggml-medium.en-q5_0.bin" `
  -f ".\samples\jfk.wav" `
  -l en `
  -ovtt `
  -of ".\test-caption"
```

Successful output creates:

```text
C:\OnyxTools\whisper.cpp\test-caption.vtt
```

The console startup information should mention the CUDA backend. If the test
works but CUDA is not mentioned, the program will still run, but it is probably
using the CPU and will be considerably slower.

## 6. Connect whisper.cpp to Onyx

Open the Onyx desktop server application:

1. Go to **Settings → Subtitles**.
2. Under **AI-generated subtitles**, choose this executable:

   ```text
   C:\OnyxTools\whisper.cpp\build\bin\Release\whisper-cli.exe
   ```

3. Choose this model:

   ```text
   C:\OnyxTools\whisper.cpp\models\ggml-medium.en-q5_0.bin
   ```

4. Enable **Automatically queue newly added videos that have no subtitles**.
5. Select **Save caption setup**.
6. Confirm that the status changes to **Ready**.

For media already in Onyx, select **Generate all missing**. To generate or
replace subtitles for one video, open that video and select **Generate AI
subtitles** in the player toolbar.

Onyx processes one video at a time. It extracts temporary 16 kHz mono audio,
runs whisper.cpp, deletes the temporary audio, and saves the completed WebVTT
file beside the video. The media folder must therefore be writable by Onyx.

After completion, the player subtitle selector shows:

```text
English · AI generated
```

## Troubleshooting

### Status remains Setup incomplete

- Select the exact `whisper-cli.exe` file rather than its folder.
- Select a `.bin` model file that still exists at the configured path.
- Keep the whisper.cpp DLL files beside `whisper-cli.exe`.
- Run `whisper-cli.exe --help` directly in PowerShell to expose missing-DLL
  errors.

### Caption generation says FFmpeg is missing

Install and verify FFmpeg:

```powershell
winget install Gyan.FFmpeg
ffmpeg -version
```

Restart Onyx after changing `PATH`.

### Caption generation fails when saving

Onyx currently writes generated captions beside the source video. Check that
the Windows account running Onyx has permission to create files in that media
folder.

### Transcription is running on the CPU

Re-run the CMake configuration with CUDA enabled and rebuild:

```powershell
Set-Location C:\OnyxTools\whisper.cpp
cmake -B build -DGGML_CUDA=ON
cmake --build build --config Release -j
```

Then repeat the command-line test and check its startup output for CUDA.

### The medium model is too slow

Download the smaller English model:

```powershell
Invoke-WebRequest `
  -Uri "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.en-q5_1.bin" `
  -OutFile ".\models\ggml-small.en-q5_1.bin"
```

Choose the new model in **Settings → Subtitles** and save again. Existing
caption files remain unchanged.
