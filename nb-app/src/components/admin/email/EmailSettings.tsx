/**
 * 邮件配置管理页面
 * 类似 xboard 的邮件配置功能
 */
import { useState, useEffect } from 'react';
import {
  MailPlus,
  Mail,
  Settings,
  Trash2,
  Edit,
  Send,
  Check,
  X,
  Eye,
  EyeOff,
  Star,
  Power,
  PowerOff,
  Plus,
  Loader2,
} from 'lucide-react';
import {
  getEmailProviders,
  getEmailConfigs,
  getEmailSettingsSummary,
  createEmailConfig,
  updateEmailConfig,
  deleteEmailConfig,
  setDefaultEmailConfig,
  toggleEmailConfig,
  testSendEmail,
  type ProviderInfo,
  type SmtpConfigInfo,
  type SmtpConfigCreate,
} from '../../../services/adminService';

// 类型安全的输入值获取函数
const getInputValue = (e: Event): string => (e.target as HTMLInputElement).value;
const getCheckboxValue = (e: Event): boolean => (e.target as HTMLInputElement).checked;

export const EmailSettings: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<{
    total_configs: number;
    enabled_configs: number;
    default_config: SmtpConfigInfo | null;
    providers: ProviderInfo[];
  } | null>(null);
  const [configs, setConfigs] = useState<SmtpConfigInfo[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingConfig, setEditingConfig] = useState<SmtpConfigInfo | null>(null);
  const [showPassword, setShowPassword] = useState<Record<string, boolean>>({});
  const [testingEmail, setTestingEmail] = useState<string | null>(null);
  const [testEmailAddress, setTestEmailAddress] = useState('');

  // 表单状态
  const [formData, setFormData] = useState<SmtpConfigCreate>({
    name: '',
    provider: 'aliyun',
    smtp_host: '',
    smtp_port: 465,
    smtp_encryption: 'ssl',
    smtp_user: '',
    smtp_password: '',
    from_email: '',
    from_name: 'NanoBanana',
    reply_to: '',
    api_key: '',
    api_url: '',
    is_enabled: true,
    is_default: false,
    daily_limit: null,
    hourly_limit: null,
    description: '',
  });

  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [summaryData, configsData] = await Promise.all([
        getEmailSettingsSummary(),
        getEmailConfigs(),
      ]);
      setSummary(summaryData);
      setConfigs(configsData);
    } catch (error) {
      console.error('Failed to load email settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleProviderChange = (provider: string) => {
    const providerInfo = summary?.providers.find(p => p.id === provider);
    setFormData({
      ...formData,
      provider,
      smtp_host: providerInfo?.smtp_host || formData.smtp_host,
      smtp_port: providerInfo?.smtp_port || 465,
      smtp_encryption: (providerInfo?.encryption as any) || 'ssl',
      api_url: providerInfo?.api_url || '',
    });
  };

  const handleCreate = async () => {
    setSubmitting(true);
    try {
      await createEmailConfig(formData);
      setShowCreateModal(false);
      resetForm();
      loadData();
    } catch (error: any) {
      alert(error.message || '创建失败');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdate = async () => {
    if (!editingConfig) return;
    setSubmitting(true);
    try {
      const updateData: any = { ...formData };
      // 只填充有值的字段
      Object.keys(updateData).forEach(key => {
        if (updateData[key] === '' || updateData[key] === null) {
          if (
![
'smtp_password', 'api_key', 'reply_to', 'daily_limit', 'hourly_limit', 'description'
].includes(key)
) {
            delete updateData[key];
          }
        }
      });
      await updateEmailConfig(editingConfig.id, updateData);
      setShowEditModal(false);
      setEditingConfig(null);
      resetForm();
      loadData();
    } catch (error: any) {
      alert(error.message || '更新失败');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (configId: string) => {
    if (!confirm('确定要删除此邮件配置吗？')) return;
    try {
      await deleteEmailConfig(configId);
      loadData();
    } catch (error: any) {
      alert(error.message || '删除失败');
    }
  };

  const handleSetDefault = async (configId: string) => {
    try {
      await setDefaultEmailConfig(configId);
      loadData();
    } catch (error: any) {
      alert(error.message || '设置失败');
    }
  };

  const handleToggle = async (configId: string) => {
    try {
      await toggleEmailConfig(configId);
      loadData();
    } catch (error: any) {
      alert(error.message || '操作失败');
    }
  };

  const handleTestSend = async (configId: string | null) => {
    if (!testEmailAddress) {
      alert('请输入测试邮箱地址');
      return;
    }
    setTestingEmail(configId || 'default');
    try {
      const result = await testSendEmail(configId, testEmailAddress);
      alert(result.message);
      if (result.success) {
        setTestEmailAddress('');
      }
    } catch (error: any) {
      alert(error.message || '发送失败');
    } finally {
      setTestingEmail(null);
    }
  };

  const openEditModal = (config: SmtpConfigInfo) => {
    setEditingConfig(config);
    setFormData({
      name: config.name,
      provider: config.provider,
      smtp_host: config.smtp_host,
      smtp_port: config.smtp_port,
      smtp_encryption: config.smtp_encryption,
      smtp_user: config.smtp_user || '',
      smtp_password: '',
      from_email: config.from_email || '',
      from_name: config.from_name,
      reply_to: config.reply_to || '',
      api_key: '',
      api_url: config.api_url || '',
      is_enabled: config.is_enabled,
      is_default: config.is_default,
      daily_limit: config.daily_limit,
      hourly_limit: config.hourly_limit,
      description: config.description || '',
    });
    setShowEditModal(true);
  };

  const resetForm = () => {
    setFormData({
      name: '',
      provider: 'aliyun',
      smtp_host: '',
      smtp_port: 465,
      smtp_encryption: 'ssl',
      smtp_user: '',
      smtp_password: '',
      from_email: '',
      from_name: 'NanoBanana',
      reply_to: '',
      api_key: '',
      api_url: '',
      is_enabled: true,
      is_default: false,
      daily_limit: null,
      hourly_limit: null,
      description: '',
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-amber-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 头部 */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">邮件配置</h2>
          <p className="text-sm text-gray-500 mt-1">
            配置邮件服务提供商，支持阿里云、腾讯云、SendGrid、Mailgun 等
          </p>
        </div>
        <button
          onClick={() => {
            resetForm();
            setShowCreateModal(true);
          }}
          className="px-4 py-2 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-xl font-medium hover:from-amber-600 hover:to-orange-600 transition-all flex items-center gap-2 shadow-lg shadow-amber-500/30"
        >
          <MailPlus size={18} />
          添加配置
        </button>
      </div>

      {/* 概览卡片 */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-gray-800 rounded-xl p-5 border border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-blue-100 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400">
              <Mail size={20} />
            </div>
            <div>
              <p className="text-sm text-gray-500">总配置数</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{summary?.total_configs || 0}</p>
            </div>
          </div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl p-5 border border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-green-100 dark:bg-green-900/20 text-green-600 dark:text-green-400">
              <Check size={20} />
            </div>
            <div>
              <p className="text-sm text-gray-500">已启用</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{summary?.enabled_configs || 0}</p>
            </div>
          </div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl p-5 border border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-amber-100 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400">
              <Star size={20} />
            </div>
            <div>
              <p className="text-sm text-gray-500">默认配置</p>
              <p className="text-lg font-bold text-gray-900 dark:text-white truncate max-w-[150px]">
                {summary?.default_config?.name || '未设置'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* 配置列表 */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h3 className="font-semibold text-gray-900 dark:text-white">邮件配置列表</h3>
        </div>
        {configs.length === 0 ? (
          <div className="p-12 text-center">
            <Mail className="w-12 h-12 mx-auto mb-3 text-gray-300 dark:text-gray-600" />
            <p className="text-gray-500">暂无邮件配置</p>
            <button
              onClick={() => {
                resetForm();
                setShowCreateModal(true);
              }}
              className="mt-4 px-4 py-2 bg-amber-500 text-white rounded-lg text-sm font-medium hover:bg-amber-600 transition-colors"
            >
              添加第一个配置
            </button>
          </div>
        ) : (
          <div className="divide-y divide-gray-200 dark:divide-gray-700">
            {configs.map((config) => (
              <div
                key={config.id}
                className={`p-5 transition-colors ${
                  !config.is_enabled ? 'opacity-60 bg-gray-50 dark:bg-gray-800/50' : ''
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <h4 className="font-semibold text-gray-900 dark:text-white">{config.name}</h4>
                      {config.is_default && (
                        <span className="px-2 py-0.5 bg-amber-100 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 text-xs font-medium rounded-full flex items-center gap-1">
                          <Star size={10} />
                          默认
                        </span>
                      )}
                      {config.is_enabled ? (
                        <span className="px-2 py-0.5 bg-green-100 dark:bg-green-900/20 text-green-600 dark:text-green-400 text-xs font-medium rounded-full">
                          已启用
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-500 text-xs font-medium rounded-full">
                          已禁用
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-500 mb-3">{config.provider_name}</p>
                    <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-gray-600 dark:text-gray-400">
                      <span>主机: {config.smtp_host}</span>
                      <span>端口: {config.smtp_port}</span>
                      <span>加密: {config.smtp_encryption.toUpperCase()}</span>
                      {config.from_email && <span>发件人: {config.from_email}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleToggle(config.id)}
                      className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                      title={config.is_enabled ? '禁用' : '启用'}
                    >
                      {config.is_enabled ? (
                        <PowerOff size={18} className="text-green-500" />
                      ) : (
                        <Power size={18} className="text-gray-400" />
                      )}
                    </button>
                    {!config.is_default && (
                      <button
                        onClick={() => handleSetDefault(config.id)}
                        className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                        title="设为默认"
                      >
                        <Star size={18} className="text-gray-400" />
                      </button>
                    )}
                    <button
                      onClick={() => openEditModal(config)}
                      className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                      title="编辑"
                    >
                      <Edit size={18} className="text-gray-400" />
                    </button>
                    <button
                      onClick={() => handleDelete(config.id)}
                      className="p-2 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/20 transition-colors"
                      title="删除"
                    >
                      <Trash2 size={18} className="text-gray-400 hover:text-red-500" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 创建/编辑弹窗 */}
      {(showCreateModal || showEditModal) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => {
              setShowCreateModal(false);
              setShowEditModal(false);
              setEditingConfig(null);
            }}
          />
          <div className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
            {/* 头部 */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-xl font-bold text-gray-900 dark:text-white">
                {showEditModal ? '编辑邮件配置' : '添加邮件配置'}
              </h3>
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  setShowEditModal(false);
                  setEditingConfig(null);
                }}
                className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              >
                <X size={20} className="text-gray-500" />
              </button>
            </div>

            {/* 内容 */}
            <div className="flex-1 overflow-y-auto p-6 space-y-5">
              {/* 基本信息 */}
              <div className="space-y-4">
                <h4 className="font-medium text-gray-900 dark:text-white">基本信息</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      配置名称
                    </label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: getInputValue(e) })}
                      placeholder="如：阿里云主邮箱"
                      className="w-full px-4 py-2 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      邮件提供商
                    </label>
                    <select
                      value={formData.provider}
                      onChange={(e) => handleProviderChange(getInputValue(e))}
                      className="w-full px-4 py-2 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                    >
                      {summary?.providers.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    描述
                  </label>
                  <input
                    type="text"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: getInputValue(e) })}
                    placeholder="可选描述信息"
                    className="w-full px-4 py-2 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                  />
                </div>
              </div>

              {/* SMTP 配置 */}
              <div className="space-y-4">
                <h4 className="font-medium text-gray-900 dark:text-white">SMTP 配置</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      SMTP 服务器
                    </label>
                    <input
                      type="text"
                      value={formData.smtp_host}
                      onChange={(e) => setFormData({ ...formData, smtp_host: getInputValue(e) })}
                      placeholder="smtp.example.com"
                      className="w-full px-4 py-2 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      端口
                    </label>
                    <input
                      type="number"
                      value={formData.smtp_port}
                      onChange={(e) => setFormData({ ...formData, smtp_port: parseInt(getInputValue(e)) || 465 })}
                      className="w-full px-4 py-2 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    加密方式
                  </label>
                  <div className="flex gap-4">
                    {(['ssl', 'tls', 'none'] as const).map((method) => (
                      <label key={method} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="encryption"
                          value={method}
                          checked={formData.smtp_encryption === method}
                          onChange={(e) => setFormData({ ...formData, smtp_encryption: getInputValue(e) })}
                          className="w-4 h-4 text-amber-500 focus:ring-amber-500"
                        />
                        <span className="text-sm text-gray-700 dark:text-gray-300 uppercase">{method}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      SMTP 用户名
                    </label>
                    <input
                      type="text"
                      value={formData.smtp_user}
                      onChange={(e) => setFormData({ ...formData, smtp_user: getInputValue(e) })}
                      placeholder="user@example.com"
                      className="w-full px-4 py-2 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      SMTP 密码
                    </label>
                    <div className="relative">
                      <input
                        type={showPassword.edit ? 'text' : 'password'}
                        value={formData.smtp_password}
                        onChange={(e) => setFormData({ ...formData, smtp_password: getInputValue(e) })}
                        placeholder="••••••••"
                        className="w-full px-4 py-2 pr-10 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword({ ...showPassword, edit: !showPassword.edit })}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      >
                        {showPassword.edit ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* 发件人配置 */}
              <div className="space-y-4">
                <h4 className="font-medium text-gray-900 dark:text-white">发件人配置</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      发件人邮箱
                    </label>
                    <input
                      type="email"
                      value={formData.from_email}
                      onChange={(e) => setFormData({ ...formData, from_email: getInputValue(e) })}
                      placeholder="noreply@example.com"
                      className="w-full px-4 py-2 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      发件人名称
                    </label>
                    <input
                      type="text"
                      value={formData.from_name}
                      onChange={(e) => setFormData({ ...formData, from_name: getInputValue(e) })}
                      placeholder="NanoBanana"
                      className="w-full px-4 py-2 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    回复邮箱（可选）
                  </label>
                  <input
                    type="email"
                    value={formData.reply_to}
                    onChange={(e) => setFormData({ ...formData, reply_to: getInputValue(e) })}
                    placeholder="support@example.com"
                    className="w-full px-4 py-2 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                  />
                </div>
              </div>

              {/* API 配置 (SendGrid, Mailgun 等) */}
              {(formData.provider === 'sendgrid' || formData.provider === 'mailgun' || formData.provider === 'ses') && (
                <div className="space-y-4">
                  <h4 className="font-medium text-gray-900 dark:text-white">API 配置</h4>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      API 密钥
                    </label>
                    <input
                      type="password"
                      value={formData.api_key}
                      onChange={(e) => setFormData({ ...formData, api_key: getInputValue(e) })}
                      placeholder="输入 API 密钥"
                      className="w-full px-4 py-2 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                    />
                  </div>
                  {formData.provider === 'mailgun' && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        API 端点 / 域名
                      </label>
                      <input
                        type="text"
                        value={formData.api_url}
                        onChange={(e) => setFormData({ ...formData, api_url: getInputValue(e) })}
                        placeholder="https://api.mailgun.net/v3/"
                        className="w-full px-4 py-2 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                      />
                    </div>
                  )}
                </div>
              )}

              {/* 限流配置 */}
              <div className="space-y-4">
                <h4 className="font-medium text-gray-900 dark:text-white">限流配置（可选）</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      每日限制
                    </label>
                    <input
                      type="number"
                      value={formData.daily_limit || ''}
                      onChange={(e) => setFormData({ ...formData, daily_limit: getInputValue(e) ? parseInt(getInputValue(e)) : null })}
                      placeholder="无限制"
                      className="w-full px-4 py-2 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      每小时限制
                    </label>
                    <input
                      type="number"
                      value={formData.hourly_limit || ''}
                      onChange={(e) => setFormData({ ...formData, hourly_limit: getInputValue(e) ? parseInt(getInputValue(e)) : null })}
                      placeholder="无限制"
                      className="w-full px-4 py-2 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                    />
                  </div>
                </div>
              </div>

              {/* 开关选项 */}
              <div className="flex flex-wrap gap-6">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.is_enabled}
                    onChange={(e) => setFormData({ ...formData, is_enabled: getCheckboxValue(e) })}
                    className="w-4 h-4 text-amber-500 focus:ring-amber-500 rounded"
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300">启用此配置</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.is_default}
                    onChange={(e) => setFormData({ ...formData, is_default: getCheckboxValue(e) })}
                    className="w-4 h-4 text-amber-500 focus:ring-amber-500 rounded"
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300">设为默认</span>
                </label>
              </div>
            </div>

            {/* 底部按钮 */}
            <div className="flex items-center justify-between px-6 py-4 bg-gray-50 dark:bg-gray-800/50 border-t border-gray-200 dark:border-gray-700">
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  setShowEditModal(false);
                  setEditingConfig(null);
                }}
                className="px-4 py-2 rounded-xl text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              >
                取消
              </button>
              <button
                onClick={showEditModal ? handleUpdate : handleCreate}
                disabled={submitting}
                className="px-6 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-white font-medium hover:from-amber-600 hover:to-orange-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {submitting ? (
                  <>
                    <Loader2 size={18} className="animate-spin" />
                    保存中...
                  </>
                ) : (
                  <>
                    <Check size={18} />
                    {showEditModal ? '保存修改' : '创建配置'}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 测试邮件 */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
        <h3 className="font-semibold text-gray-900 dark:text-white mb-4">发送测试邮件</h3>
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="email"
            value={testEmailAddress}
            onChange={(e) => setTestEmailAddress(getInputValue(e))}
            placeholder="输入测试邮箱地址"
            className="flex-1 px-4 py-2 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:border-transparent"
          />
          <button
            onClick={() => handleTestSend(null)}
            disabled={testingEmail !== null || !testEmailAddress}
            className="px-6 py-2 rounded-xl bg-gradient-to-r from-green-500 to-emerald-500 text-white font-medium hover:from-green-600 hover:to-emerald-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {testingEmail === 'default' ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                发送中...
              </>
            ) : (
              <>
                <Send size={18} />
                发送测试
              </>
            )}
          </button>
        </div>
        <p className="text-xs text-gray-500 mt-2">使用默认配置发送测试邮件</p>
      </div>
    </div>
  );
};
