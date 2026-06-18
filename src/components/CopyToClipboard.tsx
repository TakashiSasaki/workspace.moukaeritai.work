import React, { useState } from "react";
import { Copy, Check } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface CopyToClipboardProps {
  text: string;
  className?: string;
  iconSize?: number;
  showText?: boolean;
}

export function CopyToClipboard({ text, className, iconSize = 12, showText = true }: CopyToClipboardProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  return (
    <button
      onClick={handleCopy}
      className={`relative flex items-center gap-1.5 transition-colors cursor-pointer ${
        copied ? "text-emerald-400" : "text-zinc-500 hover:text-zinc-300"
      } ${className || ""}`}
      title={copied ? "Copied!" : "Copy to clipboard"}
    >
      <AnimatePresence mode="wait" initial={false}>
        {copied ? (
          <motion.div
            key="check"
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.5, opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            <Check size={iconSize} />
          </motion.div>
        ) : (
          <motion.div
            key="copy"
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.5, opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            <Copy size={iconSize} />
          </motion.div>
        )}
      </AnimatePresence>
      {showText && (
        <span className="text-[10px] font-medium">
          {copied ? "Copied!" : "Copy"}
        </span>
      )}
    </button>
  );
}
