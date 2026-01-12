' 静默启动 Python 服务器（无窗口）
Set WshShell = CreateObject("WScript.Shell")
scriptDir = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
pythonScript = scriptDir & "\python-server.py"
WshShell.Run "pythonw """ & pythonScript & """", 0, False
