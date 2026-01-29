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
        elif self.path == '/browser-ai':
            self._browser_ai()
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

    def _browser_ai(self):
        """浏览器 AI 控制（ChatGPT 等）"""
        try:
            import time
            import websocket
            import requests as req
            
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length).decode('utf-8')
            data = json.loads(body)
            
            action = data.get('action', 'chat')  # chat, get_messages, status
            message = data.get('message', '')
            timeout = data.get('timeout', 60)
            
            CDP_URL = "http://127.0.0.1:9222"
            
            # 禁用代理获取标签页
            for key in ['HTTP_PROXY', 'HTTPS_PROXY', 'http_proxy', 'https_proxy']:
                os.environ.pop(key, None)
            
            def get_tabs():
                try:
                    resp = req.get(f"{CDP_URL}/json", timeout=5, proxies={"http": None, "https": None})
                    return resp.json()
                except:
                    return []
            
            def execute_js(ws_url, script):
                try:
                    ws = websocket.create_connection(ws_url, timeout=10)
                    cmd = {"id": 1, "method": "Runtime.evaluate", "params": {"expression": script, "returnByValue": True}}
                    ws.send(json.dumps(cmd))
                    result = json.loads(ws.recv())
                    ws.close()
                    return result.get("result", {}).get("result", {}).get("value")
                except Exception as e:
                    return None
            
            # 找 ChatGPT 标签页
            tabs = get_tabs()
            chatgpt_tab = None
            for t in tabs:
                url = t.get("url", "")
                if "chatgpt.com" in url and t.get("type") == "page":
                    chatgpt_tab = t
                    if "/c/" in url:  # 优先有对话的
                        break
            
            if not chatgpt_tab:
                self._set_headers()
                self.wfile.write(json.dumps({
                    'ok': False,
                    'error': '未找到 ChatGPT 标签页，请先打开 https://chatgpt.com 并确保 Edge 以调试模式启动'
                }).encode())
                return
            
            ws_url = chatgpt_tab.get("webSocketDebuggerUrl")
            
            # 状态检查
            if action == 'status':
                self._set_headers()
                self.wfile.write(json.dumps({
                    'ok': True,
                    'connected': True,
                    'tab': chatgpt_tab.get('title'),
                    'url': chatgpt_tab.get('url')
                }).encode())
                return
            
            # 获取消息
            if action == 'get_messages':
                script = '''
                (function() {
                    var result = { user: [], assistant: [] };
                    document.querySelectorAll('[data-message-author-role="user"]').forEach(function(el) {
                        var bubble = el.querySelector('.whitespace-pre-wrap');
                        result.user.push(bubble ? bubble.innerText : el.innerText);
                    });
                    document.querySelectorAll('[data-message-author-role="assistant"]').forEach(function(el) {
                        var md = el.querySelector('.markdown');
                        result.assistant.push(md ? md.innerText : el.innerText);
                    });
                    return result;
                })()
                '''
                msgs = execute_js(ws_url, script) or {"user": [], "assistant": []}
                self._set_headers()
                self.wfile.write(json.dumps({'ok': True, 'messages': msgs}).encode())
                return
            
            # 发送消息
            if action == 'chat':
                if not message:
                    self._set_headers(400)
                    self.wfile.write(json.dumps({'error': 'Missing message'}).encode())
                    return
                
                # 获取当前消息数
                count_script = 'document.querySelectorAll(\'[data-message-author-role="assistant"]\').length'
                old_count = execute_js(ws_url, count_script) or 0
                
                # 输入消息
                escaped_msg = message.replace('\\', '\\\\').replace("'", "\\'").replace('\n', '\\n')
                input_script = f'''
                (function() {{
                    var textarea = document.querySelector('#prompt-textarea');
                    if (!textarea) return {{ error: "找不到输入框" }};
                    textarea.innerHTML = '<p>{escaped_msg}</p>';
                    textarea.dispatchEvent(new Event('input', {{ bubbles: true }}));
                    return {{ success: true }};
                }})()
                '''
                execute_js(ws_url, input_script)
                time.sleep(0.3)
                
                # 点击发送
                send_script = '''
                (function() {
                    var btn = document.querySelector('button[data-testid="send-button"]');
                    if (btn) { btn.click(); return { success: true }; }
                    return { error: "找不到发送按钮" };
                })()
                '''
                execute_js(ws_url, send_script)
                
                # 等待回复（流式检测）
                last_text = ""
                last_images = []
                stable_count = 0
                
                for i in range(timeout * 2):
                    time.sleep(0.5)
                    
                    # 获取文本和图片
                    check_script = '''
                    (function() {
                        var msgs = document.querySelectorAll('[data-message-author-role="assistant"]');
                        if (msgs.length === 0) return { count: 0, text: "", images: [] };
                        var last = msgs[msgs.length - 1];
                        var md = last.querySelector('.markdown');
                        
                        // HTML 转 Markdown 函数
                        function htmlToMarkdown(el) {
                            if (!el) return "";
                            var result = "";
                            
                            function processNode(node, listDepth) {
                                listDepth = listDepth || 0;
                                var indent = "  ".repeat(listDepth);
                                
                                if (node.nodeType === 3) {
                                    // 文本节点
                                    return node.textContent;
                                }
                                if (node.nodeType !== 1) return "";
                                
                                var tag = node.tagName.toLowerCase();
                                var children = "";
                                for (var i = 0; i < node.childNodes.length; i++) {
                                    children += processNode(node.childNodes[i], listDepth);
                                }
                                
                                switch (tag) {
                                    case "p":
                                        return children + "\\n\\n";
                                    case "br":
                                        return "\\n";
                                    case "strong":
                                    case "b":
                                        return "**" + children + "**";
                                    case "em":
                                    case "i":
                                        return "*" + children + "*";
                                    case "code":
                                        if (node.parentElement && node.parentElement.tagName.toLowerCase() === "pre") {
                                            return children;
                                        }
                                        return "`" + children + "`";
                                    case "pre":
                                        var codeEl = node.querySelector("code");
                                        var lang = "";
                                        if (codeEl && codeEl.className) {
                                            var match = codeEl.className.match(/language-(\\w+)/);
                                            if (match) lang = match[1];
                                        }
                                        var codeText = codeEl ? codeEl.textContent : children;
                                        return "```" + lang + "\\n" + codeText + "\\n```\\n\\n";
                                    case "h1":
                                        return "# " + children + "\\n\\n";
                                    case "h2":
                                        return "## " + children + "\\n\\n";
                                    case "h3":
                                        return "### " + children + "\\n\\n";
                                    case "h4":
                                        return "#### " + children + "\\n\\n";
                                    case "h5":
                                        return "##### " + children + "\\n\\n";
                                    case "h6":
                                        return "###### " + children + "\\n\\n";
                                    case "ul":
                                        var ulResult = "";
                                        for (var j = 0; j < node.children.length; j++) {
                                            if (node.children[j].tagName.toLowerCase() === "li") {
                                                ulResult += indent + "- " + processNode(node.children[j], listDepth + 1).trim() + "\\n";
                                            }
                                        }
                                        return ulResult + (listDepth === 0 ? "\\n" : "");
                                    case "ol":
                                        var olResult = "";
                                        var num = 1;
                                        for (var k = 0; k < node.children.length; k++) {
                                            if (node.children[k].tagName.toLowerCase() === "li") {
                                                olResult += indent + num + ". " + processNode(node.children[k], listDepth + 1).trim() + "\\n";
                                                num++;
                                            }
                                        }
                                        return olResult + (listDepth === 0 ? "\\n" : "");
                                    case "li":
                                        return children;
                                    case "a":
                                        var href = node.getAttribute("href") || "";
                                        return "[" + children + "](" + href + ")";
                                    case "blockquote":
                                        return "> " + children.split("\\n").join("\\n> ") + "\\n\\n";
                                    case "hr":
                                        return "---\\n\\n";
                                    case "table":
                                        return children + "\\n";
                                    case "thead":
                                    case "tbody":
                                        return children;
                                    case "tr":
                                        var cells = [];
                                        for (var m = 0; m < node.children.length; m++) {
                                            cells.push(processNode(node.children[m], listDepth).trim());
                                        }
                                        return "| " + cells.join(" | ") + " |\\n";
                                    case "th":
                                    case "td":
                                        return children;
                                    case "img":
                                        var alt = node.getAttribute("alt") || "image";
                                        var src = node.getAttribute("src") || "";
                                        return "![" + alt + "](" + src + ")";
                                    case "span":
                                    case "div":
                                        return children;
                                    default:
                                        return children;
                                }
                            }
                            
                            return processNode(el, 0).trim();
                        }
                        
                        var text = md ? htmlToMarkdown(md) : last.innerText;
                        
                        // 提取图片
                        var images = [];
                        var imgElements = last.querySelectorAll('img');
                        imgElements.forEach(function(img) {
                            var src = img.src || img.getAttribute('src');
                            if (src && !src.startsWith('data:')) {
                                images.push({
                                    src: src,
                                    alt: img.alt || ''
                                });
                            }
                        });
                        
                        return { count: msgs.length, text: text, images: images };
                    })()
                    '''
                    value = execute_js(ws_url, check_script)
                    if not value:
                        continue
                    
                    new_count = value.get("count", 0)
                    current_text = value.get("text", "")
                    current_images = value.get("images", [])
                    
                    if new_count <= old_count:
                        continue
                    
                    # 检查文本和图片是否都稳定
                    images_stable = (current_images == last_images)
                    text_stable = (current_text == last_text and current_text)
                    
                    if text_stable and images_stable:
                        stable_count += 1
                        if stable_count >= 3:
                            # 构建包含图片的响应
                            response_text = current_text
                            if current_images:
                                # 在文本末尾添加图片的 Markdown
                                img_markdown = "\n\n"
                                for img in current_images:
                                    alt = img.get('alt', '图片')
                                    src = img.get('src', '')
                                    img_markdown += f"![{alt}]({src})\n"
                                response_text += img_markdown
                            
                            self._set_headers()
                            self.wfile.write(json.dumps({
                                'ok': True,
                                'response': response_text,
                                'images': current_images
                            }).encode())
                            return
                    else:
                        stable_count = 0
                        last_text = current_text
                        last_images = current_images
                
                # 超时 - 也返回已获取的图片
                response_text = last_text
                if last_images:
                    img_markdown = "\n\n"
                    for img in last_images:
                        alt = img.get('alt', '图片')
                        src = img.get('src', '')
                        img_markdown += f"![{alt}]({src})\n"
                    response_text += img_markdown
                
                self._set_headers()
                self.wfile.write(json.dumps({
                    'ok': False,
                    'error': '等待回复超时',
                    'partial': response_text,
                    'images': last_images
                }).encode())
                return
            
            self._set_headers(400)
            self.wfile.write(json.dumps({'error': f'Unknown action: {action}'}).encode())
            
        except Exception as e:
            self._set_headers(500)
            self.wfile.write(json.dumps({
                'ok': False,
                'error': str(e),
                'traceback': traceback.format_exc()
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
║    POST /browser-ai  - 浏览器 AI 控制 (ChatGPT)               ║
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
