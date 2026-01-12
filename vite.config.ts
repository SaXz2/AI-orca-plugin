import react from "@vitejs/plugin-react-swc";
import externalGlobals from "rollup-plugin-external-globals";
import { defineConfig } from "vite";
import { viteStaticCopy } from "vite-plugin-static-copy";

// https://vitejs.dev/config/
export default defineConfig(({ command }) => {
  return {
    define: {
      "process.env": {
        NODE_ENV: JSON.stringify(
          command === "build" ? "production" : "development"
        ),
      },
    },
    build: {
      lib: {
        entry: "src/main.ts",
        fileName: "index",
        formats: ["es"],
      },
      rollupOptions: {
        external: ["react", "react-dom", "valtio"],
        output: {
          // 分离文档解析库到单独的 chunk
          manualChunks: {
            "document-parsers": ["xlsx", "mammoth", "unpdf"],
          },
          chunkFileNames: "[name].js",
        },
      },
    },
    plugins: [
      react(),
      externalGlobals({
        react: "React",
        "react-dom": "ReactDOM",
        valtio: "Valtio",
      }),
      // 复制静态文件到 dist
      viteStaticCopy({
        targets: [
          // Pyodide 文件
          {
            src: "node_modules/pyodide/*.{js,wasm,json,zip}",
            dest: "pyodide",
          },
          // Python 服务器脚本
          {
            src: "scripts/python-server.py",
            dest: "scripts",
          },
          // Python 服务器启动脚本 (Windows - 有窗口)
          {
            src: "scripts/start-python-server.bat",
            dest: "scripts",
          },
          // Python 服务器启动脚本 (Windows - 静默无窗口)
          {
            src: "scripts/start-python-server-silent.vbs",
            dest: "scripts",
          },
        ],
      }),
    ],
  };
});
