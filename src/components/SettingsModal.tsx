import { useState, useEffect, useCallback } from "react";
import { IconClose } from "./Icons";
import { registerBackHandler, unregisterBackHandler } from "../utils/backButtonManager";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  temperature: number;
  maxTokens: number;
  topP: number;
  frequencyPenalty: number;
  presencePenalty: number;
  systemPrompt: string;
  reasoningEffort: string;
  thinkingEnabled: boolean;
  supportsThinking: boolean;
  onSave: (params: {
    temperature: number;
    maxTokens: number;
    topP: number;
    frequencyPenalty: number;
    presencePenalty: number;
    systemPrompt: string;
    reasoningEffort: string;
  }) => void;
}

export function SettingsModal({
  isOpen,
  onClose,
  temperature: initTemp,
  maxTokens: initTokens,
  topP: initTopP,
  frequencyPenalty: initFreq,
  presencePenalty: initPres,
  systemPrompt: initPrompt,
  reasoningEffort: initEffort,
  thinkingEnabled,
  supportsThinking,
  onSave,
}: SettingsModalProps) {
  const [temperature, setTemperature] = useState(initTemp);
  const [maxTokens, setMaxTokens] = useState(initTokens);
  const [topP, setTopP] = useState(initTopP);
  const [frequencyPenalty, setFrequencyPenalty] = useState(initFreq);
  const [presencePenalty, setPresencePenalty] = useState(initPres);
  const [systemPrompt, setSystemPrompt] = useState(initPrompt);
  const [reasoningEffort, setReasoningEffort] = useState(initEffort);

  const closeHandler = useCallback(() => {
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (!isOpen) return;
    registerBackHandler(closeHandler);
    return () => {
      unregisterBackHandler(closeHandler);
    };
  }, [isOpen, closeHandler]);

  if (!isOpen) return null;

  const thinkingOn = thinkingEnabled && supportsThinking;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal__header">
          <h3>对话参数设置</h3>
          <button className="btn-close" onClick={onClose}><IconClose /></button>
        </div>

        <div className="modal__body">
          {thinkingOn && (
            <label className="setting-item">
              <span>思考强度</span>
              <select
                value={reasoningEffort}
                onChange={(e) => setReasoningEffort(e.target.value)}
              >
                <option value="high">High</option>
                <option value="max">Max</option>
              </select>
              <p className="setting-item__hint">控制模型推理深度，max 在复杂任务上表现更好</p>
            </label>
          )}

          {!thinkingOn && (
            <>
              <label className="setting-item">
                <span>Temperature</span>
                <div className="setting-item__control">
                  <input
                    type="range"
                    min="0"
                    max="2"
                    step="0.1"
                    value={temperature}
                    onChange={(e) => setTemperature(parseFloat(e.target.value))}
                  />
                  <span className="setting-item__value">{temperature}</span>
                </div>
                <p className="setting-item__hint">越高越随机，越低越确定。默认 1.0</p>
              </label>

              <label className="setting-item">
                <span>Top P</span>
                <div className="setting-item__control">
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={topP}
                    onChange={(e) => setTopP(parseFloat(e.target.value))}
                  />
                  <span className="setting-item__value">{topP}</span>
                </div>
                <p className="setting-item__hint">核采样，只从概率最高的前 N% token 中选择。默认 1.0</p>
              </label>

              <label className="setting-item">
                <span>频率惩罚</span>
                <div className="setting-item__control">
                  <input
                    type="range"
                    min="-2"
                    max="2"
                    step="0.1"
                    value={frequencyPenalty}
                    onChange={(e) => setFrequencyPenalty(parseFloat(e.target.value))}
                  />
                  <span className="setting-item__value">{frequencyPenalty}</span>
                </div>
                <p className="setting-item__hint">正值降低模型逐字重复相同内容的概率。默认 0</p>
              </label>

              <label className="setting-item">
                <span>存在惩罚</span>
                <div className="setting-item__control">
                  <input
                    type="range"
                    min="-2"
                    max="2"
                    step="0.1"
                    value={presencePenalty}
                    onChange={(e) => setPresencePenalty(parseFloat(e.target.value))}
                  />
                  <span className="setting-item__value">{presencePenalty}</span>
                </div>
                <p className="setting-item__hint">正值鼓励模型谈论新主题。默认 0</p>
              </label>
            </>
          )}

          <label className="setting-item">
            <span>最大 Token 数</span>
            <input
              type="number"
              value={maxTokens}
              onChange={(e) => setMaxTokens(parseInt(e.target.value) || 0)}
              min={1}
              max={384000}
              placeholder="留空为 API 默认"
            />
            <p className="setting-item__hint">限制单次回复的最大长度，0 = 使用 API 默认值</p>
          </label>

          <label className="setting-item">
            <span>System Prompt</span>
            <textarea
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              rows={4}
              placeholder="可选：设置系统提示词..."
            />
            <p className="setting-item__hint">对话级的系统提示，优先级最高</p>
          </label>
        </div>

        <div className="modal__footer">
          <button className="btn btn-secondary" onClick={onClose}>
            取消
          </button>
          <button
            className="btn btn-primary"
            onClick={() => {
              onSave({ temperature, maxTokens, topP, frequencyPenalty, presencePenalty, systemPrompt, reasoningEffort });
              onClose();
            }}
          >
            保存
          </button>
        </div>
      </div>
    </div>
  );
}
