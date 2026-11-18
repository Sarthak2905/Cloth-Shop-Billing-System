@echo off
title Label printer helper
cd /d "%~dp0"
node label-helper.cjs
pause