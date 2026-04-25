@echo off
REM Replace YOUR_USERNAME with your actual GitHub username
REM Replace k8s-sandbox with your actual repo name

git remote add origin https://github.com/YOUR_USERNAME/k8s-sandbox.git
git branch -M main
git push -u origin main

echo.
echo Done! Check your GitHub repository.
pause
