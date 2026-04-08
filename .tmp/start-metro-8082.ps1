Set-Location "C:\Users\mahdi\morakaba"
$env:ANDROID_HOME="C:\Users\mahdi\AppData\Local\Android\Sdk"
$env:ANDROID_SDK_ROOT=$env:ANDROID_HOME
$env:Path="$env:ANDROID_HOME\platform-tools;$env:Path"
npx expo start --dev-client --port 8082 --host lan --non-interactive
