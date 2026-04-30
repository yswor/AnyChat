import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useProviderStore } from "../stores/providerStore";
import { invoke } from "@tauri-apps/api/core";
import { v4 as uuidv4 } from "uuid";
import Database from "@tauri-apps/plugin-sql";
import { PROVIDER_TEMPLATES, type ModelInfo } from "../types";
import { IconClose } from "../components/Icons";
import { ConfirmDialog } from "../components/ConfirmDialog";

export function ProviderEditPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isNew = !id;
  const { providers, addProvider, updateProvider, removeProvider, loadProviders } =
    useProviderStore();

  const [template, setTemplate] = useState<string>("");
  const [name, setName] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [models, setModels] = useState<string[]>([]);
  const [defaultModel, setDefaultModel] = useState("");
  const [supportsThinking, setSupportsThinking] = useState(false);
  const defaultThinkingParam = PROVIDER_TEMPLATES.custom.thinking_param;
  const [thinkingSwitch, setThinkingSwitch] = useState(defaultThinkingParam?.switch ?? "thinking");
  const [thinkingEffort, setThinkingEffort] = useState(defaultThinkingParam?.effort ?? "reasoning_effort");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);


  const [testing, setTesting] = useState(false);
  const [testError, setTestError] = useState<string | null>(null);
  const [fetchedModels, setFetchedModels] = useState<ModelInfo[] | null>(null);
  const [newModelInput, setNewModelInput] = useState("");

  useEffect(() => {
    if (!isNew && id) {
      const prov = providers.find((p) => p.id === id);
      if (prov) {
        setName(prov.name);
        setBaseUrl(prov.base_url);
        setApiKey("");
        setModels(prov.models);
        setDefaultModel(prov.default_model || "");
        setSupportsThinking(prov.supports_thinking);
        if (prov.thinking_param) {
          setThinkingSwitch(prov.thinking_param.switch);
          setThinkingEffort(prov.thinking_param.effort);
        }
      }
    }
  }, [isNew, id, providers]);

  const applyTemplate = (key: string) => {
    const t = PROVIDER_TEMPLATES[key];
    if (!t) return;
    setTemplate(key);
    setName(t.name);
    setBaseUrl(t.base_url);
    setSupportsThinking(t.supports_thinking);
    if (t.thinking_param) {
      setThinkingSwitch(t.thinking_param.switch);
      setThinkingEffort(t.thinking_param.effort);
    }
    if (t.default_model) {
      setDefaultModel(t.default_model);
    }
    setTestError(null);
    setFetchedModels(null);
  };

  const handleTestConnection = async () => {
    if (!baseUrl || !apiKey) {
      setTestError("请填写 Base URL 和 API Key");
      return;
    }

    setTesting(true);
    setTestError(null);
    setFetchedModels(null);

    try {
      const result = await invoke<{
        success: boolean;
        models?: ModelInfo[];
        error?: string;
      }>("test_connection", {
        baseUrl,
        apiKey,
      });

      if (result.success && result.models) {
        setFetchedModels(result.models);
        const modelIds = result.models.map((m) => m.id);
        setModels(modelIds);
        if (modelIds.length > 0 && !defaultModel) {
          setDefaultModel(modelIds[0]);
        }
      } else {
        setTestError(result.error || "连接失败");
      }
    } catch (err) {
      setTestError(String(err));
    } finally {
      setTesting(false);
    }
  };

  const addCustomModel = () => {
    const m = newModelInput.trim();
    if (m && !models.includes(m)) {
      setModels([...models, m]);
    }
    setNewModelInput("");
  };

  const removeModel = (m: string) => {
    const updated = models.filter((x) => x !== m);
    setModels(updated);
    if (defaultModel === m) {
      setDefaultModel(updated[0] || "");
    }
  };

  const handleSave = async () => {
    if (!name.trim() || !baseUrl.trim() || (isNew && !apiKey.trim())) {
      setTestError("名称、Base URL 和 API Key 为必填项");
      return;
    }

    if (isNew) {
      const d = await Database.load("sqlite:anychat.db");
      const providerId = uuidv4();
      const now = new Date().toISOString();

      // Encrypt API key
      const encrypted = await invoke<{ encrypted: string }>("encrypt_key", {
        key: apiKey,
      });

      const thinkingParam = supportsThinking
        ? JSON.stringify({
            switch: thinkingSwitch,
            effort: thinkingEffort,
          })
        : null;

      await d.execute(
        `INSERT INTO providers (id, name, base_url, api_key, models, default_model, supports_thinking, thinking_param, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          providerId,
          name.trim(),
          baseUrl.trim(),
          encrypted.encrypted,
          JSON.stringify(models),
          defaultModel || null,
          supportsThinking ? 1 : 0,
          thinkingParam,
          now,
          now,
        ],
      );

      addProvider({
        id: providerId,
        name: name.trim(),
        base_url: baseUrl.trim(),
        api_key: "",
        models,
        default_model: defaultModel || undefined,
        supports_thinking: supportsThinking,
        thinking_param: supportsThinking
          ? { switch: thinkingSwitch, effort: thinkingEffort }
          : undefined,
        created_at: now,
        updated_at: now,
      });
    } else if (id) {
      const d = await Database.load("sqlite:anychat.db");

      let encryptedKey: string | null = null;
      if (apiKey.trim()) {
        const encrypted = await invoke<{ encrypted: string }>("encrypt_key", {
          key: apiKey,
        });
        encryptedKey = encrypted.encrypted;
      }

      const thinkingParam = supportsThinking
        ? JSON.stringify({
            switch: thinkingSwitch,
            effort: thinkingEffort,
          })
        : null;

      const now = new Date().toISOString();

      if (encryptedKey) {
        await d.execute(
          `UPDATE providers SET name=$1, base_url=$2, api_key=$3, models=$4, default_model=$5, supports_thinking=$6, thinking_param=$7, updated_at=$8 WHERE id=$9`,
          [
            name.trim(),
            baseUrl.trim(),
            encryptedKey,
            JSON.stringify(models),
            defaultModel || null,
            supportsThinking ? 1 : 0,
            thinkingParam,
            now,
            id,
          ],
        );
      } else {
        await d.execute(
          `UPDATE providers SET name=$1, base_url=$2, models=$3, default_model=$4, supports_thinking=$5, thinking_param=$6, updated_at=$7 WHERE id=$8`,
          [
            name.trim(),
            baseUrl.trim(),
            JSON.stringify(models),
            defaultModel || null,
            supportsThinking ? 1 : 0,
            thinkingParam,
            now,
            id,
          ],
        );
      }

      updateProvider(id, {
        name: name.trim(),
        base_url: baseUrl.trim(),
        models,
        default_model: defaultModel || undefined,
        supports_thinking: supportsThinking,
        thinking_param: supportsThinking
          ? { switch: thinkingSwitch, effort: thinkingEffort }
          : undefined,
      });
    }

    await loadProviders();
    navigate("/settings");
  };

  const handleDelete = async () => {
    if (!id) return;
    removeProvider(id);
    navigate("/settings");
  };

  return (
    <div className="provider-edit-page">
      <h2 className="provider-edit-page__title">{isNew ? "添加供应商" : "编辑供应商"}</h2>

      <div className="provider-edit-page__body">
        {isNew && (
          <div className="template-section">
            <h3>选择预设模板</h3>
            <div className="template-grid">
              {Object.entries(PROVIDER_TEMPLATES).map(([key, tpl]) => (
                <button
                  key={key}
                  className={`template-card ${template === key ? "template-card--active" : ""}`}
                  onClick={() => applyTemplate(key)}
                >
                  <div className="template-card__name">{tpl.name || "自定义"}</div>
                  <div className="template-card__desc">{tpl.description}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="form-section">
          <label className="form-item">
            <span>名称 *</span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="如：自定义名称"
            />
          </label>

          <label className="form-item">
            <span>Base URL *</span>
            <input
              type="text"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://your-api-endpoint.com"
            />
          </label>

          <label className="form-item">
            <span>API Key *</span>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={isNew ? "输入 API Key" : "留空则不修改"}
            />
          </label>

          <div className="form-item">
            <span>思考模式</span>
            <label className="toggle-label">
              <input
                type="checkbox"
                checked={supportsThinking}
                onChange={(e) => setSupportsThinking(e.target.checked)}
              />
              <span>支持思考模式</span>
            </label>
          </div>

          <div className="form-item">
            <span>模型列表</span>
            <div className="model-list">
              {models.map((m) => (
                <span key={m} className="model-tag">
                  {m}
                  <button onClick={() => removeModel(m)}><IconClose size={12} /></button>
                </span>
              ))}
            </div>
            <div className="model-add-row">
              <input
                type="text"
                value={newModelInput}
                onChange={(e) => setNewModelInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addCustomModel()}
                placeholder="手动添加模型..."
              />
              <button className="btn btn-sm" onClick={addCustomModel}>
                +
              </button>
            </div>
          </div>

          {models.length > 0 && (
            <label className="form-item">
              <span>默认模型</span>
              <select
                value={defaultModel}
                onChange={(e) => setDefaultModel(e.target.value)}
              >
                {models.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </label>
          )}

          <div className="form-actions">
            <button
              className="btn btn-secondary"
              onClick={handleTestConnection}
              disabled={testing || !baseUrl || !apiKey}
            >
              {testing ? "测试中..." : "测试连接"}
            </button>
          </div>

          {testError && (
            <div className="form-error">
              <p>{testError}</p>
            </div>
          )}

          {fetchedModels && fetchedModels.length > 0 && (
            <div className="form-success">
              <p>连接成功！已获取 {fetchedModels.length} 个模型</p>
            </div>
          )}

          {fetchedModels && fetchedModels.length === 0 && (
            <div className="form-success">
              <p>连接成功！模型列表为空，请手动添加模型后保存</p>
            </div>
          )}
        </div>
      </div>

      <div className="provider-edit-page__footer">
        {!isNew && (
          <button className="btn btn-danger" onClick={() => setShowDeleteConfirm(true)}>
            删除供应商
          </button>
        )}
        <button className="btn btn-primary" onClick={handleSave}>
          保存
        </button>
      </div>

      <ConfirmDialog
        isOpen={showDeleteConfirm}
        title="删除供应商"
        message="确定要删除该供应商吗？对话会保留但失去关联。"
        confirmText="删除"
        onConfirm={handleDelete}
        onClose={() => setShowDeleteConfirm(false)}
      />
    </div>
  );
}
