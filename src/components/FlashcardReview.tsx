/**
 * FlashcardReview - 闪卡复习交互组件
 * 
 * 功能：
 * - 卡片翻转动画（洗牌手感）
 * - 跳过/保留按钮
 * - 完成后显示录入结果
 */

const React = window.React as unknown as {
  createElement: typeof window.React.createElement;
  useState: <T>(initial: T | (() => T)) => [T, (next: T | ((prev: T) => T)) => void];
  useCallback: <T extends (...args: any[]) => any>(fn: T, deps: any[]) => T;
  useEffect: (effect: () => void | (() => void), deps?: any[]) => void;
  Fragment: typeof window.React.Fragment;
};
const { createElement, useState, useCallback, useEffect, Fragment } = React;

export interface Flashcard {
  id: string;
  front: string;  // 正面内容（问题/关键词）
  back: string;   // 背面内容（答案/解释，选择题时为空）
  tags?: string[]; // 可选标签
  cardType?: "basic" | "choice"; // 卡片类型
  options?: { text: string; isCorrect: boolean }[]; // 选择题选项
  ordered?: boolean; // 选择题是否固定顺序
}

interface FlashcardReviewProps {
  cards: Flashcard[];
  onComplete: (keptCards: Flashcard[]) => void;
  onKeepCard?: (card: Flashcard) => Promise<void>; // 即时保存单张卡片
  onCancel?: () => void;
}

// 样式定义
const containerStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  padding: "16px",
  minHeight: "280px",
};

const cardContainerStyle: React.CSSProperties = {
  perspective: "1000px",
  width: "100%",
  maxWidth: "360px",
  height: "200px",
  marginBottom: "16px",
};

const cardStyle = (isFlipped: boolean, isExiting: boolean, exitDirection: "left" | "right" | null): React.CSSProperties => ({
  position: "relative",
  width: "100%",
  height: "100%",
  transformStyle: "preserve-3d",
  transition: isExiting ? "transform 0.4s ease-out, opacity 0.4s ease-out" : "transform 0.5s ease",
  transform: isExiting 
    ? `translateX(${exitDirection === "left" ? "-150%" : "150%"}) rotate(${exitDirection === "left" ? "-15deg" : "15deg"})`
    : isFlipped 
      ? "rotateY(180deg)" 
      : "rotateY(0deg)",
  opacity: isExiting ? 0 : 1,
  cursor: "pointer",
});

const cardFaceStyle = (isBack: boolean): React.CSSProperties => ({
  position: "absolute",
  width: "100%",
  height: "100%",
  backfaceVisibility: "hidden",
  borderRadius: "12px",
  padding: "16px",
  display: "flex",
  flexDirection: "column",
  justifyContent: "center",
  alignItems: "center",
  textAlign: "center",
  boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
  transform: isBack ? "rotateY(180deg)" : "rotateY(0deg)",
  background: isBack 
    ? "var(--orca-color-primary)"
    : "var(--orca-color-bg-1)",
  color: isBack ? "#fff" : "var(--orca-color-text-1)",
  border: "1px solid var(--orca-color-border)",
  overflow: "auto",
});

const buttonContainerStyle: React.CSSProperties = {
  display: "flex",
  gap: "12px",
  marginTop: "12px",
};

const buttonStyle = (variant: "skip" | "keep"): React.CSSProperties => ({
  padding: "10px 24px",
  borderRadius: "20px",
  border: "none",
  cursor: "pointer",
  fontSize: "14px",
  fontWeight: 600,
  display: "flex",
  alignItems: "center",
  gap: "6px",
  transition: "all 0.2s ease",
  background: variant === "keep" 
    ? "var(--orca-color-primary)" 
    : "var(--orca-color-bg-3)",
  color: variant === "keep" 
    ? "#fff" 
    : "var(--orca-color-text-1)",
});

const progressStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "8px",
  marginBottom: "12px",
  color: "var(--orca-color-text-1)",
  fontSize: "13px",
};

const progressBarStyle = (progress: number): React.CSSProperties => ({
  width: "160px",
  height: "4px",
  borderRadius: "2px",
  background: "var(--orca-color-bg-3)",
  overflow: "hidden",
  position: "relative",
});

const progressFillStyle = (progress: number): React.CSSProperties => ({
  position: "absolute",
  left: 0,
  top: 0,
  height: "100%",
  width: `${progress}%`,
  background: "var(--orca-color-primary)",
  borderRadius: "2px",
  transition: "width 0.3s ease",
});

const completedStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: "12px",
  padding: "24px 16px",
  textAlign: "center",
};

const statsStyle: React.CSSProperties = {
  display: "flex",
  gap: "24px",
  marginTop: "8px",
};

const statItemStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: "4px",
};

const hintStyle: React.CSSProperties = {
  fontSize: "11px",
  color: "var(--orca-color-text-3)",
  marginTop: "8px",
};

export default function FlashcardReview({ cards, onComplete, onKeepCard, onCancel }: FlashcardReviewProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [keptCount, setKeptCount] = useState(0);
  const [skippedCount, setSkippedCount] = useState(0);
  const [isExiting, setIsExiting] = useState(false);
  const [exitDirection, setExitDirection] = useState<"left" | "right" | null>(null);
  const [isCompleted, setIsCompleted] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const currentCard = cards[currentIndex];
  const progress = cards.length > 0 ? ((currentIndex) / cards.length) * 100 : 0;

  // 处理卡片翻转
  const handleFlip = useCallback(() => {
    if (!isExiting && !isSaving) {
      setIsFlipped(!isFlipped);
    }
  }, [isFlipped, isExiting, isSaving]);

  // 移动到下一张卡片
  const moveToNext = useCallback(async (direction: "left" | "right", kept: boolean) => {
    if (isSaving) return;
    
    setIsExiting(true);
    setExitDirection(direction);

    // 如果保留，立即保存到日记
    if (kept && onKeepCard) {
      setIsSaving(true);
      try {
        await onKeepCard(currentCard);
        setKeptCount(prev => prev + 1);
      } catch (err) {
        console.error("[FlashcardReview] Save failed:", err);
      } finally {
        setIsSaving(false);
      }
    } else if (kept) {
      setKeptCount(prev => prev + 1);
    } else {
      setSkippedCount(prev => prev + 1);
    }

    setTimeout(() => {
      if (currentIndex + 1 >= cards.length) {
        // 完成所有卡片 - 传递保留的卡片数量（用数组长度表示）
        setIsCompleted(true);
        // 创建一个长度等于 keptCount 的数组来传递保留数量
        const keptCardsPlaceholder = Array(keptCount + (kept ? 1 : 0)).fill({} as Flashcard);
        onComplete(keptCardsPlaceholder);
      } else {
        setCurrentIndex(prev => prev + 1);
        setIsFlipped(false);
        setIsExiting(false);
        setExitDirection(null);
      }
    }, 400);
  }, [currentIndex, cards.length, currentCard, onComplete, onKeepCard, isSaving]);

  // 跳过当前卡片
  const handleSkip = useCallback(() => {
    if (!isExiting && !isSaving) {
      moveToNext("left", false);
    }
  }, [isExiting, isSaving, moveToNext]);

  // 保留当前卡片
  const handleKeep = useCallback(() => {
    if (!isExiting && !isSaving) {
      moveToNext("right", true);
    }
  }, [isExiting, isSaving, moveToNext]);

  // 键盘快捷键
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isCompleted || isExiting || isSaving) return;
      
      switch (e.key) {
        case " ": // 空格翻转
          e.preventDefault();
          handleFlip();
          break;
        case "ArrowLeft": // 左箭头跳过
        case "s":
        case "S":
          e.preventDefault();
          handleSkip();
          break;
        case "ArrowRight": // 右箭头保留
        case "k":
        case "K":
          e.preventDefault();
          handleKeep();
          break;
        case "Escape":
          e.preventDefault();
          onCancel?.();
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isCompleted, isExiting, isSaving, handleFlip, handleSkip, handleKeep, onCancel]);

  // 完成状态
  if (isCompleted) {
    return createElement(
      "div",
      { style: completedStyle },
      createElement("i", {
        className: "ti ti-check-circle",
        style: { fontSize: "48px", color: "var(--orca-color-success, #28a745)" },
      }),
      createElement(
        "div",
        { style: { fontSize: "18px", fontWeight: 600, color: "var(--orca-color-text-1)" } },
        "✨ 闪卡复习完成！"
      ),
      createElement(
        "div",
        { style: statsStyle },
        createElement(
          "div",
          { style: statItemStyle },
          createElement("span", { style: { fontSize: "24px", fontWeight: 700, color: "var(--orca-color-primary)" } }, keptCount),
          createElement("span", { style: { fontSize: "12px", color: "var(--orca-color-text-3)" } }, "已保留")
        ),
        createElement(
          "div",
          { style: statItemStyle },
          createElement("span", { style: { fontSize: "24px", fontWeight: 700, color: "var(--orca-color-text-3)" } }, skippedCount),
          createElement("span", { style: { fontSize: "12px", color: "var(--orca-color-text-3)" } }, "已跳过")
        )
      ),
      keptCount > 0 && createElement(
        "div",
        { style: { fontSize: "14px", color: "var(--orca-color-text-2)", marginTop: "8px" } },
        `${keptCount} 张卡片已录入今日日记`
      )
    );
  }

  // 空卡片状态
  if (!currentCard) {
    return createElement(
      "div",
      { style: completedStyle },
      createElement("i", {
        className: "ti ti-cards",
        style: { fontSize: "48px", color: "var(--orca-color-text-3)" },
      }),
      createElement(
        "div",
        { style: { fontSize: "16px", color: "var(--orca-color-text-2)" } },
        "没有可复习的闪卡"
      )
    );
  }

  return createElement(
    "div",
    { style: containerStyle },
    
    // 进度条
    createElement(
      "div",
      { style: progressStyle },
      createElement("span", null, `${currentIndex + 1} / ${cards.length}`),
      createElement(
        "div",
        { style: progressBarStyle(progress) },
        createElement("div", { style: progressFillStyle(progress) })
      )
    ),

    // 卡片区域
    createElement(
      "div",
      { style: cardContainerStyle, onClick: handleFlip },
      createElement(
        "div",
        { style: cardStyle(isFlipped, isExiting, exitDirection) },
        // 正面
        createElement(
          "div",
          { style: cardFaceStyle(false) },
          // 选择题标识
          currentCard.cardType === "choice" && createElement(
            "div",
            { 
              style: { 
                position: "absolute", 
                top: "10px", 
                right: "10px",
                padding: "2px 8px",
                borderRadius: "4px",
                background: "var(--orca-color-primary)",
                color: "#fff",
                fontSize: "10px",
                fontWeight: 600,
              } 
            },
            "选择题"
          ),
          createElement(
            "div",
            { style: { fontSize: "15px", lineHeight: 1.5, whiteSpace: "pre-wrap", color: "var(--orca-color-text-1)" } },
            currentCard.front
          ),
          createElement(
            "div",
            { style: { marginTop: "auto", paddingTop: "10px", fontSize: "11px", color: "var(--orca-color-text-3)" } },
            currentCard.cardType === "choice" ? "点击翻转查看选项" : "点击翻转查看答案"
          )
        ),
        // 背面
        createElement(
          "div",
          { style: cardFaceStyle(true) },
          // 选择题显示选项
          currentCard.cardType === "choice" && currentCard.options
            ? createElement(
                "div",
                { style: { width: "100%", textAlign: "left" } },
                ...currentCard.options.map((opt, i) =>
                  createElement(
                    "div",
                    {
                      key: i,
                      style: {
                        padding: "6px 10px",
                        marginBottom: "4px",
                        borderRadius: "6px",
                        background: opt.isCorrect 
                          ? "rgba(40, 167, 69, 0.4)" 
                          : "rgba(255,255,255,0.15)",
                        border: opt.isCorrect 
                          ? "1px solid rgba(40, 167, 69, 0.6)" 
                          : "1px solid rgba(255,255,255,0.25)",
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                        fontSize: "13px",
                        color: "#fff",
                      },
                    },
                    createElement(
                      "span",
                      { 
                        style: { 
                          width: "18px", 
                          height: "18px", 
                          borderRadius: "50%", 
                          background: opt.isCorrect ? "#28a745" : "rgba(255,255,255,0.25)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: "11px",
                          flexShrink: 0,
                        } 
                      },
                      opt.isCorrect ? "✓" : String.fromCharCode(65 + i)
                    ),
                    opt.text
                  )
                )
              )
            : createElement(
                "div",
                { style: { fontSize: "14px", lineHeight: 1.5, whiteSpace: "pre-wrap", color: "#fff" } },
                currentCard.back
              ),
          currentCard.tags && currentCard.tags.length > 0 && createElement(
            "div",
            { 
              style: { 
                marginTop: "auto", 
                paddingTop: "10px", 
                display: "flex", 
                gap: "4px", 
                flexWrap: "wrap",
                justifyContent: "center",
              } 
            },
            ...currentCard.tags.map((tag, i) => 
              createElement(
                "span",
                { 
                  key: i,
                  style: { 
                    padding: "2px 6px", 
                    borderRadius: "8px", 
                    background: "rgba(255,255,255,0.25)",
                    fontSize: "10px",
                    color: "#fff",
                  } 
                },
                `#${tag}`
              )
            )
          )
        )
      )
    ),

    // 操作按钮
    createElement(
      "div",
      { style: buttonContainerStyle },
      createElement(
        "button",
        { 
          style: buttonStyle("skip"), 
          onClick: handleSkip,
          disabled: isExiting,
          title: "跳过 (← 或 S)",
        },
        createElement("i", { className: "ti ti-x" }),
        "跳过"
      ),
      createElement(
        "button",
        { 
          style: buttonStyle("keep"), 
          onClick: handleKeep,
          disabled: isExiting,
          title: "保留 (→ 或 K)",
        },
        createElement("i", { className: "ti ti-check" }),
        "保留"
      )
    ),

    // 快捷键提示
    createElement(
      "div",
      { style: hintStyle },
      "空格翻转 · ←/S 跳过 · →/K 保留 · Esc 取消"
    )
  );
}
