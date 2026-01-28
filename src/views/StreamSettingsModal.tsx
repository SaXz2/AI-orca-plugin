/**
 * Stream Settings Modal
 * 配置流式响应相关设置（保持上下文干净，不做历史压缩）
 */

const React = window.React as unknown as {
  createElement: typeof window.React.createElement;
  useState: <T>(initial: T | (() => T)) => [T, (next: T | ((prev: T) => T)) => void];
  useEffect: (fn: () => void | (() => void), deps: any[]) => void;
};
const { createElement, useState, useEffect } = React;
const { Button } = orca.components;

import { getAiChatPluginName } from "../ui/ai-chat-ui";
import { getAiChatSettings, updateAiChatSettings } from "../settings/ai-chat-settings";

interface CompressionSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function StreamSettingsModal({ isOpen, onClose }: CompressionSettingsModalProps) {
  const [streamTimeout, setStreamTimeout] = useState(30);
  const [saving, setSaving] = useState(false);

  // 加载当前设置
  useEffect(() => {
    if (isOpen) {
      const pluginName = getAiChatPluginName();
      const settings = getAiChatSettings(pluginName);
      setStreamTimeout(Math.round(settings.streamTimeout / 1000));
    }
  }, [isOpen]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const pluginName = getAiChatPluginName();
      await updateAiChatSettings("app", pluginName, {
        streamTimeout: streamTimeout * 1000,
      });
      orca.notify("success", "设置已保存");
      onClose();
    } catch (e) {
      orca.notify("error", "保存失败");
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  const overlayStyle: React.CSSProperties = {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: "rgba(0,0,0,0.5)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1000,
  };

  const modalStyle: React.CSSProperties = {
    background: "var(--orca-color-bg-1)",
    borderRadius: 12,
    padding: 24,
    width: 360,
    maxWidth: "90vw",
    boxShadow: "0 8px 32px rgba(0,0,0,0.2)",
  };

  const titleStyle: React.CSSProperties = {
    fontSize: 18,
    fontWeight: 600,
    marginBottom: 20,
    color: "var(--orca-color-text-1)",
  };

  const rowStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 14,
    color: "var(--orca-color-text-1)",
  };

  const descStyle: React.CSSProperties = {
    fontSize: 12,
    color: "var(--orca-color-text-3)",
    marginTop: 4,
  };

  const selectStyle: React.CSSProperties = {
    padding: "6px 12px",
    borderRadius: 6,
    border: "1px solid var(--orca-color-border)",
    background: "var(--orca-color-bg-2)",
    color: "var(--orca-color-text-1)",
    fontSize: 14,
    cursor: "pointer",
  };


  const footerStyle: React.CSSProperties = {
    display: "flex",
    justifyContent: "flex-end",
    gap: 12,
    marginTop: 24,
  };

  return createElement(
    "div",
    { style: overlayStyle, onClick: onClose },
    createElement(
      "div",
      { style: modalStyle, onClick: (e: any) => e.stopPropagation() },
      // Title
      createElement("div", { style: titleStyle }, "流式设置"),
      
      // Stream timeout setting
      createElement(
        "div",
        { style: { ...rowStyle, marginTop: 8 } },
        createElement(
          "div",
          null,
          createElement("div", { style: labelStyle }, "流式响应超时"),
          createElement("div", { style: descStyle }, "本地模型建议设置 120 秒或更长")
        ),
        createElement(
          "select",
          {
            style: selectStyle,
            value: streamTimeout,
            onChange: (e: any) => setStreamTimeout(Number(e.target.value)),
          },
          [30, 60, 90, 120, 180, 300].map(n =>
            createElement("option", { key: n, value: n }, `${n} 秒`)
          )
        )
      ),
      
      // Info
      createElement(
        "div",
        {
          style: {
            padding: 12,
            background: "var(--orca-color-bg-2)",
            borderRadius: 8,
            fontSize: 13,
            color: "var(--orca-color-text-2)",
            lineHeight: 1.5,
          },
        },
        "流式超时用于本地模型/慢接口：超过该时间未收到数据将中止本次请求。"
      ),
      
      // Footer
      createElement(
        "div",
        { style: footerStyle },
        createElement(
          Button,
          { variant: "plain", onClick: onClose },
          "取消"
        ),
        createElement(
          Button,
          { variant: "primary", onClick: handleSave, disabled: saving },
          saving ? "保存中..." : "保存"
        )
      )
    )
  );
}
