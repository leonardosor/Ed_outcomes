@echo off
setlocal EnableExtensions

REM ===== EDIT THESE TWO LINES =====
set "MODEL=E:\models\GLM-4.7-Flash-Q2_K_L.gguf"
set "PORT=8001"
REM  PORT must match LLAMA_PORT in cc.cmd
REM ================================

if not exist "%MODEL%" goto nomodel

echo [llama] loading %MODEL%
echo [llama] port %PORT%, ctx 32768
llama-server --model "%MODEL%" --port %PORT% --ctx-size 32768 --batch-size 512 --ubatch-size 256 --cache-type-k q4_0 --cache-type-v q4_0 --flash-attn on --n-gpu-layers 99 --jinja
goto :eof

:nomodel
echo.
echo ERROR: model file not found: %MODEL%
echo Edit start-llama.cmd and set MODEL to the real .gguf path.
echo.
exit /b 1
