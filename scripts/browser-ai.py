#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
浏览器 AI 控制脚本
通过 CDP 协议控制已登录的 AI 网页（ChatGPT、Claude 等）
自动启动调试模式的 Edge，无需手动配置
"""

import json
import os
import time
import subprocess
import requests
import websocket

CDP_URL = "http://127.0.0.1:9222"

# 禁用代理
for key in ['HTTP_PROXY', 'HTTPS_PROXY', 'http_proxy', 'https_proxy']:
    os.environ.pop(key, None)


def find_edge_path():
    """查找 Edge 浏览器路径"""
    possible_paths = [
        r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
        r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
        os.path.expandvars(r"%LOCALAPPDATA%\Microsoft\Edge\Application\msedge.exe"),
    ]
    for path in possible_paths:
        if os.path.exists(path):
            return path
    return None


def is_debug_edge_running():
    """检查调试模式的 Edge 是否已运行"""
    try:
        resp = requests.get(f"{CDP_URL}/json/version", timeout=2, proxies={"http": None, "https": None})
        return resp.status_code == 200
    except:
        return False


def launch_debug_edge(url="https://chatgpt.com"):
    """启动调试模式的 Edge 浏览器"""
    if is_debug_edge_running():
        print("✓ 调试模式 Edge 已在运行")
        return True
    
    edge_path = find_edge_path()
    if not edge_path:
        print("✗ 找不到 Edge 浏览器，请确认已安装")
        return False
    
    # 使用独立的用户数据目录，避免与正常 Edge 冲突
    user_data_dir = os.path.join(os.environ.get("TEMP", "."), "edge-debug-profile")
    
    print("正在启动调试模式 Edge...")
    try:
        subprocess.Popen([
            edge_path,
            f"--remote-debugging-port=9222",
            "--remote-allow-origins=*",
            f"--user-data-dir={user_data_dir}",
            url
        ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        
        # 等待 Edge 启动
        for i in range(10):
            time.sleep(1)
            if is_debug_edge_running():
                print("✓ Edge 调试模式启动成功")
                return True
            print(f"  等待启动... ({i+1}/10)")
        
        print("✗ Edge 启动超时")
        return False
    except Exception as e:
        print(f"✗ 启动失败: {e}")
        return False

class BrowserAI:
    def __init__(self):
        self.ws_url = None
        self.tab_info = None
    
    def get_tabs(self):
        """获取所有标签页"""
        try:
            resp = requests.get(f"{CDP_URL}/json", timeout=5, proxies={"http": None, "https": None})
            return resp.json()
        except Exception as e:
            print(f"连接失败: {e}")
            return []
    
    def execute_js(self, script):
        """执行 JavaScript"""
        if not self.ws_url:
            return None
        try:
            ws = websocket.create_connection(self.ws_url, timeout=10)
            cmd = {"id": 1, "method": "Runtime.evaluate", "params": {"expression": script, "returnByValue": True}}
            ws.send(json.dumps(cmd))
            result = json.loads(ws.recv())
            ws.close()
            return result.get("result", {}).get("result", {}).get("value")
        except Exception as e:
            print(f"执行错误: {e}")
            return None
    
    def connect_chatgpt(self):
        """连接 ChatGPT 标签页"""
        tabs = self.get_tabs()
        for t in tabs:
            url = t.get("url", "")
            if "chatgpt.com/c/" in url and t.get("type") == "page":
                self.ws_url = t.get("webSocketDebuggerUrl")
                self.tab_info = {"type": "chatgpt", "title": t.get("title"), "url": url}
                return True
        # 退而求其次
        for t in tabs:
            if "chatgpt.com" in t.get("url", "") and t.get("type") == "page":
                self.ws_url = t.get("webSocketDebuggerUrl")
                self.tab_info = {"type": "chatgpt", "title": t.get("title"), "url": t.get("url")}
                return True
        return False
    
    def get_messages(self):
        """获取当前对话消息"""
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
        return self.execute_js(script) or {"user": [], "assistant": []}
    
    def send_message(self, message, wait_response=True, timeout=60):
        """发送消息并等待回复"""
        # 获取当前消息数
        msgs = self.get_messages()
        old_count = len(msgs.get("assistant", []))
        
        # 输入消息
        input_script = f'''
        (function() {{
            var textarea = document.querySelector('#prompt-textarea');
            if (!textarea) return {{ error: "找不到输入框" }};
            textarea.innerHTML = '<p>{message}</p>';
            textarea.dispatchEvent(new Event('input', {{ bubbles: true }}));
            return {{ success: true }};
        }})()
        '''
        if not self.execute_js(input_script):
            return {"error": "输入失败"}
        
        time.sleep(0.3)
        
        # 点击发送
        send_script = '''
        (function() {
            var btn = document.querySelector('button[data-testid="send-button"]');
            if (btn) { btn.click(); return { success: true }; }
            return { error: "找不到发送按钮" };
        })()
        '''
        if not self.execute_js(send_script):
            return {"error": "发送失败"}
        
        if not wait_response:
            return {"success": True, "message": "已发送"}
        
        # 等待回复（流式检测）
        last_text = ""
        stable_count = 0
        
        for i in range(timeout * 2):
            time.sleep(0.5)
            
            check_script = '''
            (function() {
                var msgs = document.querySelectorAll('[data-message-author-role="assistant"]');
                if (msgs.length === 0) return { count: 0, text: "" };
                var last = msgs[msgs.length - 1];
                var md = last.querySelector('.markdown');
                return { count: msgs.length, text: md ? md.innerText : last.innerText };
            })()
            '''
            value = self.execute_js(check_script)
            if not value:
                continue
            
            new_count = value.get("count", 0)
            current_text = value.get("text", "")
            
            if new_count <= old_count:
                continue
            
            if current_text == last_text and current_text:
                stable_count += 1
                if stable_count >= 3:
                    return {"success": True, "response": current_text}
            else:
                stable_count = 0
                last_text = current_text
        
        return {"error": "超时", "partial": last_text}


def chat(message):
    """快捷函数：发送消息并获取回复"""
    ai = BrowserAI()
    if not ai.connect_chatgpt():
        return {"error": "未找到 ChatGPT 标签页，请先打开 https://chatgpt.com"}
    return ai.send_message(message)


# 命令行测试
if __name__ == "__main__":
    import sys
    
    if len(sys.argv) > 1:
        # 命令行模式
        message = " ".join(sys.argv[1:])
        print(f"发送: {message}")
        result = chat(message)
        if result.get("success"):
            print(f"回复: {result['response']}")
        else:
            print(f"错误: {result.get('error')}")
    else:
        # 交互模式
        print("=== ChatGPT 浏览器控制 ===")
        print("使用方法: python browser-ai.py <消息>")
        print("或直接运行进入交互模式\n")
        
        ai = BrowserAI()
        if not ai.connect_chatgpt():
            print("未找到 ChatGPT，请先打开 https://chatgpt.com")
            print("并确保 Edge 以调试模式启动:")
            print("  msedge --remote-debugging-port=9222 --remote-allow-origins=*")
            exit(1)
        
        print(f"已连接: {ai.tab_info['title']}\n")
        
        while True:
            try:
                msg = input("你: ").strip()
                if not msg:
                    continue
                if msg.lower() in ['exit', 'quit', 'q']:
                    break
                
                print("等待回复...")
                result = ai.send_message(msg)
                if result.get("success"):
                    print(f"ChatGPT: {result['response']}\n")
                else:
                    print(f"错误: {result.get('error')}\n")
            except KeyboardInterrupt:
                break
        
        print("\n再见!")
