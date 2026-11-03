@echo off
REM ============================================================
REM  cc.cmd  -  Launch Claude Code against LOCAL llama.cpp or the API
REM     cc local     -> local llama.cpp server (lean, no MCP)
REM     cc api       -> Anthropic cloud API (normal setup)
REM  Extra args pass through, e.g.  cc api --continue
REM ============================================================
setlocal EnableExtensions

REM Capture this script's folder BEFORE any shift (shift also moves %0).
set "HERE=%~dp0"

REM ---- edit if your llama-server uses a different port ----
set "LLAMA_PORT=8001"

set "MODE=%~1"
if not defined MODE goto usage

set "EXTRA="
shift
:collect
if "%~1"=="" goto run
set "EXTRA=%EXTRA% %1"
shift
goto collect

:run
if /I "%MODE%"=="local" goto local
if /I "%MODE%"=="api"   goto api
goto usage

:local
set "ANTHROPIC_BASE_URL=http://localhost:%LLAMA_PORT%"
set "ANTHROPIC_AUTH_TOKEN=local"
set "ANTHROPIC_MODEL=local"
set "ANTHROPIC_SMALL_FAST_MODEL=local"
set "CLAUDE_CONFIG_DIR=%USERPROFILE%\.claude-local"
set "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1"
echo [cc] local mode on port %LLAMA_PORT% (lean: no MCP/skills)
claude --strict-mcp-config --mcp-config "%HERE%empty-mcp.json"%EXTRA%
goto :eof

:api
REM Uses your normal %USERPROFILE%\.claude config (login, skills, MCP).
set "CLAUDE_CONFIG_DIR=%USERPROFILE%\.claude"
echo [cc] api mode (Anthropic cloud)
claude%EXTRA%
goto :eof

:usage
echo Usage: cc [local^|api] [extra claude args...]
exit /b 1
