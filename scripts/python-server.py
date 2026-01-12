#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
本地 Python 执行服务器
用于 Orca AI Chat 插件执行本地 Python 脚本

使用方法:
  python python-server.py [port]
  
默认端口: 18765
"""

import http.server
import json
import subprocess
import sys
import os
import tempfile
import traceback
from urllib.parse import urlparse, parse_qs

# 强制使用 UTF-8 编码（解决 Windows GBK 编码问题）
if sys.platform == 'win32':
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

DEFAULT_PORT = 18765

class PythonExecutorHandler(http.server.BaseHTTPRequestHandler):
    def _set_headers(self, status=200, content_type='application/json'):
        self.send_response(status)
        self.send_header('Content-Type', content_type)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def do_OPTIONS(self):
        self._set_headers()

    def do_GET(self):
        """健康检查"""
        if self.path == '/health' or self.path == '/':
            self._set_headers()
            response = {
                'status': 'ok',
                'python_version': sys.version,
                'cwd': os.getcwd()
            }
            self.wfile.write(json.dumps(response).encode())
        else:
            self._set_headers(404)
            self.wfile.write(json.dumps({'error': 'Not found'}).encode())

    def do_POST(self):
        if self.path == '/execute':
            self._execute_code()
        elif self.path == '/run-file':
            self._run_file()
        elif self.path == '/read-file':
            self._read_file()
        elif self.path == '/write-file':
            self._write_file()
        elif self.path == '/delete-file':
            self._delete_file()
        elif self.path == '/list-dir':
            self._list_dir()
        elif self.path == '/shutdown':
            self._shutdown()
        else:
            self._set_headers(404)
            self.wfile.write(json.dumps({'error': 'Not found'}).encode())

    def _execute_code(self):
        """执行 Python 代码"""
        try:
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length).decode('utf-8')
            data = json.loads(body)
            
            code = data.get('code', '')
            input_data = data.get('input')
            timeout = data.get('timeout', 30)
            
            if not code:
                self._set_headers(400)
                self.wfile.write(json.dumps({'error': 'Missing code'}).encode())
                return
            
            # 创建临时文件执行代码
            with tempfile.NamedTemporaryFile(mode='w', suffix='.py', delete=False, encoding='utf-8') as f:
                # 注入 input 变量
                if input_data is not None:
                    f.write(f'import json\n')
                    f.write(f'input = input_data = json.loads({json.dumps(json.dumps(input_data))})\n')
                f.write(code)
                temp_file = f.name
            
            try:
                # 设置环境变量强制 Python 使用 UTF-8
                env = os.environ.copy()
                env['PYTHONIOENCODING'] = 'utf-8'
                env['PYTHONUTF8'] = '1'
                
                result = subprocess.run(
                    [sys.executable, temp_file],
                    capture_output=True,
                    text=True,
                    timeout=timeout,
                    cwd=os.getcwd(),
                    env=env,
                    encoding='utf-8',
                    errors='replace'
                )
                
                self._set_headers()
                response = {
                    'ok': True,
                    'stdout': result.stdout,
                    'stderr': result.stderr,
                    'returncode': result.returncode
                }
                self.wfile.write(json.dumps(response).encode())
            finally:
                os.unlink(temp_file)
                
        except subprocess.TimeoutExpired:
            self._set_headers()
            self.wfile.write(json.dumps({
                'ok': False,
                'error': f'Execution timed out after {timeout} seconds'
            }).encode())
        except Exception as e:
            self._set_headers(500)
            self.wfile.write(json.dumps({
                'ok': False,
                'error': str(e),
                'traceback': traceback.format_exc()
            }).encode())

    def _run_file(self):
        """执行本地 Python 文件"""
        try:
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length).decode('utf-8')
            data = json.loads(body)
            
            file_path = data.get('file')
            args = data.get('args', [])
            timeout = data.get('timeout', 60)
            cwd = data.get('cwd')
            
            if not file_path:
                self._set_headers(400)
                self.wfile.write(json.dumps({'error': 'Missing file path'}).encode())
                return
            
            # 检查文件是否存在
            if not os.path.isfile(file_path):
                self._set_headers(400)
                self.wfile.write(json.dumps({'error': f'File not found: {file_path}'}).encode())
                return
            
            # 执行文件
            cmd = [sys.executable, file_path] + args
            
            # 设置环境变量强制 Python 使用 UTF-8
            env = os.environ.copy()
            env['PYTHONIOENCODING'] = 'utf-8'
            env['PYTHONUTF8'] = '1'
            
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=timeout,
                cwd=cwd or os.path.dirname(file_path) or os.getcwd(),
                env=env,
                encoding='utf-8',
                errors='replace'
            )
            
            self._set_headers()
            response = {
                'ok': True,
                'stdout': result.stdout,
                'stderr': result.stderr,
                'returncode': result.returncode
            }
            self.wfile.write(json.dumps(response).encode())
            
        except subprocess.TimeoutExpired:
            self._set_headers()
            self.wfile.write(json.dumps({
                'ok': False,
                'error': f'Execution timed out after {timeout} seconds'
            }).encode())
        except Exception as e:
            self._set_headers(500)
            self.wfile.write(json.dumps({
                'ok': False,
                'error': str(e),
                'traceback': traceback.format_exc()
            }).encode())

    def log_message(self, format, *args):
        print(f"[Python Server] {args[0]}")

    def _shutdown(self):
        """关闭服务器"""
        self._set_headers()
        self.wfile.write(json.dumps({'ok': True, 'message': 'Server shutting down'}).encode())
        # 在单独的线程中关闭服务器，避免阻塞响应
        import threading
        def shutdown():
            self.server.shutdown()
        threading.Thread(target=shutdown).start()

    def _read_file(self):
        """读取文件内容"""
        try:
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length).decode('utf-8')
            data = json.loads(body)
            
            file_path = data.get('path')
            encoding = data.get('encoding', 'utf-8')
            
            if not file_path:
                self._set_headers(400)
                self.wfile.write(json.dumps({'error': 'Missing file path'}).encode())
                return
            
            if not os.path.isfile(file_path):
                self._set_headers(400)
                self.wfile.write(json.dumps({'error': f'File not found: {file_path}'}).encode())
                return
            
            with open(file_path, 'r', encoding=encoding) as f:
                content = f.read()
            
            self._set_headers()
            self.wfile.write(json.dumps({
                'ok': True,
                'content': content,
                'path': file_path,
                'size': len(content)
            }).encode())
            
        except Exception as e:
            self._set_headers(500)
            self.wfile.write(json.dumps({
                'ok': False,
                'error': str(e)
            }).encode())

    def _write_file(self):
        """写入文件内容"""
        try:
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length).decode('utf-8')
            data = json.loads(body)
            
            file_path = data.get('path')
            content = data.get('content')
            encoding = data.get('encoding', 'utf-8')
            create_dirs = data.get('createDirs', False)
            
            if not file_path:
                self._set_headers(400)
                self.wfile.write(json.dumps({'error': 'Missing file path'}).encode())
                return
            
            if content is None:
                self._set_headers(400)
                self.wfile.write(json.dumps({'error': 'Missing content'}).encode())
                return
            
            # 创建目录（如果需要）
            dir_path = os.path.dirname(file_path)
            if dir_path and create_dirs and not os.path.exists(dir_path):
                os.makedirs(dir_path)
            
            with open(file_path, 'w', encoding=encoding) as f:
                f.write(content)
            
            self._set_headers()
            self.wfile.write(json.dumps({
                'ok': True,
                'path': file_path,
                'size': len(content)
            }).encode())
            
        except Exception as e:
            self._set_headers(500)
            self.wfile.write(json.dumps({
                'ok': False,
                'error': str(e)
            }).encode())

    def _delete_file(self):
        """删除文件或目录"""
        try:
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length).decode('utf-8')
            data = json.loads(body)
            
            file_path = data.get('path')
            recursive = data.get('recursive', False)
            
            if not file_path:
                self._set_headers(400)
                self.wfile.write(json.dumps({'error': 'Missing file path'}).encode())
                return
            
            if not os.path.exists(file_path):
                self._set_headers(400)
                self.wfile.write(json.dumps({'error': f'Path not found: {file_path}'}).encode())
                return
            
            import shutil
            
            if os.path.isfile(file_path):
                os.remove(file_path)
                self._set_headers()
                self.wfile.write(json.dumps({
                    'ok': True,
                    'path': file_path,
                    'type': 'file'
                }).encode())
            elif os.path.isdir(file_path):
                if recursive:
                    shutil.rmtree(file_path)
                else:
                    os.rmdir(file_path)  # 只能删除空目录
                self._set_headers()
                self.wfile.write(json.dumps({
                    'ok': True,
                    'path': file_path,
                    'type': 'directory'
                }).encode())
            
        except OSError as e:
            self._set_headers(400)
            self.wfile.write(json.dumps({
                'ok': False,
                'error': str(e)
            }).encode())
        except Exception as e:
            self._set_headers(500)
            self.wfile.write(json.dumps({
                'ok': False,
                'error': str(e)
            }).encode())

    def _list_dir(self):
        """列出目录内容"""
        try:
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length).decode('utf-8')
            data = json.loads(body)
            
            dir_path = data.get('path', '.')
            pattern = data.get('pattern')  # 可选的文件名过滤
            
            if not os.path.isdir(dir_path):
                self._set_headers(400)
                self.wfile.write(json.dumps({'error': f'Directory not found: {dir_path}'}).encode())
                return
            
            entries = []
            for name in os.listdir(dir_path):
                if pattern and pattern not in name:
                    continue
                full_path = os.path.join(dir_path, name)
                stat = os.stat(full_path)
                entries.append({
                    'name': name,
                    'path': full_path,
                    'isDir': os.path.isdir(full_path),
                    'size': stat.st_size if os.path.isfile(full_path) else 0,
                    'modified': stat.st_mtime
                })
            
            # 排序：目录在前，然后按名称
            entries.sort(key=lambda x: (not x['isDir'], x['name'].lower()))
            
            self._set_headers()
            self.wfile.write(json.dumps({
                'ok': True,
                'path': dir_path,
                'entries': entries
            }).encode())
            
        except Exception as e:
            self._set_headers(500)
            self.wfile.write(json.dumps({
                'ok': False,
                'error': str(e)
            }).encode())


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_PORT
    
    server = http.server.HTTPServer(('127.0.0.1', port), PythonExecutorHandler)
    print(f"""
╔══════════════════════════════════════════════════════════════╗
║           Orca AI Chat - Python 执行服务器                    ║
╠══════════════════════════════════════════════════════════════╣
║  状态: 运行中                                                 ║
║  地址: http://127.0.0.1:{port:<5}                               ║
║  Python: {sys.version.split()[0]:<10}                                     ║
╠══════════════════════════════════════════════════════════════╣
║  API 端点:                                                    ║
║    GET  /health      - 健康检查                               ║
║    POST /execute     - 执行 Python 代码                       ║
║    POST /run-file    - 执行本地 .py 文件                      ║
║    POST /read-file   - 读取文件内容                           ║
║    POST /write-file  - 写入文件内容                           ║
║    POST /delete-file - 删除文件或目录                         ║
║    POST /list-dir    - 列出目录内容                           ║
║    POST /shutdown    - 关闭服务器                             ║
╠══════════════════════════════════════════════════════════════╣
║  按 Ctrl+C 停止服务器                                         ║
╚══════════════════════════════════════════════════════════════╝
""")
    
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n服务器已停止")
        server.shutdown()


if __name__ == '__main__':
    main()
