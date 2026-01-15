/**
 * 支付页面组件
 * 支持套餐选择、USDT 支付、订单状态轮询
 */
import { useState, useEffect, useCallback } from 'react';
import {
    X, CheckCircle, Clock, Copy, AlertCircle, ChevronRight,
    Wallet, QrCode, TrendingUp, CreditCard, Star
} from 'lucide-react';
import {
    getPaymentPlans,
    createOrder,
    getPaymentInfo,
    getOrderDetail,
    cancelOrder,
    getPaymentMethods,
    pollOrderStatus,
    formatOrderStatus,
    formatPaymentMethod,
    getTimeRemaining,
    formatTimeRemaining,
    type PaymentPlan,
    type PaymentMethod,
    type UsdtPaymentInfo,
    type OrderDetail,
} from '../services/paymentService';

interface PaymentPageProps {
    onClose?: () => void;
    initialPlanId?: string;
}

export function PaymentPage({ onClose, initialPlanId }: PaymentPageProps) {
    // 状态管理
    const [plans, setPlans] = useState<PaymentPlan[]>([]);
    const [paymentMethods, setPaymentMethods] = useState<any[]>([]);
    const [selectedPlan, setSelectedPlan] = useState<PaymentPlan | null>(null);
    const [selectedMethod, setSelectedMethod] = useState<PaymentMethod>('usdt_trc20');
    const [order, setOrder] = useState<OrderDetail | null>(null);
    const [paymentInfo, setPaymentInfo] = useState<UsdtPaymentInfo | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [copied, setCopied] = useState(false);
    const [copiedRedeem, setCopiedRedeem] = useState(false);
    const [timeRemaining, setTimeRemaining] = useState(0);
    const [step, setStep] = useState<'select' | 'payment' | 'success'>('select');

    // 加载套餐列表
    const loadPlans = useCallback(async () => {
        try {
            const data = await getPaymentPlans();
            setPlans(data);

            // 如果有初始套餐 ID，自动选中
            if (initialPlanId) {
                const plan = data.find(p => p.id === initialPlanId);
                if (plan) setSelectedPlan(plan);
            }
        } catch (err) {
            setError((err as Error).message);
        }
    }, [initialPlanId]);

    // 加载支付方式
    const loadPaymentMethods = useCallback(async () => {
        try {
            const data = await getPaymentMethods();
            setPaymentMethods(data.filter((m: any) => m.enabled));

            // 默认选择第一个启用的支付方式
            const enabled = data.find((m: any) => m.enabled);
            if (enabled) {
                setSelectedMethod(enabled.method);
            }
        } catch (err) {
            console.error('加载支付方式失败:', err);
        }
    }, []);

    // 创建订单
    const handleCreateOrder = async () => {
        if (!selectedPlan) return;

        setLoading(true);
        setError('');

        try {
            const orderData = await createOrder({
                plan_id: selectedPlan.id,
                payment_method: selectedMethod,
            });

            setOrder(orderData);
            setStep('payment');

            // 获取支付信息
            const info = await getPaymentInfo(orderData.trade_no);
            setPaymentInfo(info);

            // 设置倒计时
            setTimeRemaining(getTimeRemaining(info.expires_at));

            // 开始轮询订单状态
            pollOrderStatus(orderData.trade_no, (updatedOrder) => {
                setOrder(updatedOrder);

                if (updatedOrder.status === 'paid') {
                    setStep('success');
                }
            });
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setLoading(false);
        }
    };

    // 复制地址
    const handleCopyAddress = async () => {
        if (!paymentInfo) return;

        try {
            await navigator.clipboard.writeText(paymentInfo.wallet_address);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (err) {
            setError('复制失败');
        }
    };

    const handleCopyRedeemCode = async () => {
        if (!order?.redeem_code) return;

        try {
            await navigator.clipboard.writeText(order.redeem_code);
            setCopiedRedeem(true);
            setTimeout(() => setCopiedRedeem(false), 2000);
        } catch (err) {
            setError('复制失败');
        }
    };

    // 取消订单
    const handleCancelOrder = async () => {
        if (!order) return;

        try {
            await cancelOrder(order.trade_no);
            setStep('select');
            setOrder(null);
            setPaymentInfo(null);
        } catch (err) {
            setError((err as Error).message);
        }
    };

    // 初始化加载
    useEffect(() => {
        loadPlans();
        loadPaymentMethods();
    }, [loadPlans, loadPaymentMethods]);

    // 倒计时
    useEffect(() => {
        if (step !== 'payment' || timeRemaining <= 0) return;

        const timer = setInterval(() => {
            setTimeRemaining(prev => {
                const next = prev - 1000;
                if (next <= 0) {
                    setStep('select');
                    setError('订单已过期');
                    return 0;
                }
                return next;
            });
        }, 1000);

        return () => clearInterval(timer);
    }, [step, timeRemaining]);

    // 获取支付方式图标
    const getMethodIcon = (method: PaymentMethod) => {
        const icons: Record<PaymentMethod, string> = {
            usdt_trc20: '🔷',
            usdt_erc20: '🔷',
            usdt_bep20: '🔷',
        };
        return icons[method] || '💰';
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-950">
            {/* Header */}
            <div className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 sticky top-0 z-10">
                <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
                    <h1 className="text-xl font-bold text-gray-900 dark:text-white">
                        {step === 'select' && '购买积分'}
                        {step === 'payment' && '支付订单'}
                        {step === 'success' && '支付成功'}
                    </h1>
                    {onClose && (
                        <button
                            onClick={onClose}
                            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition"
                        >
                            <X className="w-5 h-5 text-gray-500" />
                        </button>
                    )}
                </div>
            </div>

            {/* 错误提示 */}
            {error && (
                <div className="max-w-4xl mx-auto px-4 mt-4">
                    <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900/30 text-red-600 dark:text-red-400 rounded-xl p-4 flex items-center gap-3">
                        <AlertCircle className="w-5 h-5 flex-shrink-0" />
                        <span>{error}</span>
                    </div>
                </div>
            )}

            <div className="max-w-4xl mx-auto px-4 py-8">
                {/* 步骤1: 选择套餐 */}
                {step === 'select' && (
                    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
                        {/* 支付方式选择 */}
                        {paymentMethods.length > 1 && (
                            <div>
                                <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 mb-3">选择支付方式</h2>
                                <div className="grid grid-cols-3 gap-3">
                                    {paymentMethods.map(method => (
                                        <button
                                            key={method.method}
                                            onClick={() => setSelectedMethod(method.method)}
                                            className={`p-4 rounded-xl border-2 transition-all ${
                                                selectedMethod === method.method
                                                    ? 'border-amber-500 bg-amber-50 dark:bg-amber-900/20'
                                                    : 'border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700'
                                            }`}
                                        >
                                            <div className="text-2xl mb-1">{getMethodIcon(method.method)}</div>
                                            <div className="text-sm font-medium text-gray-900 dark:text-white">{method.name}</div>
                                            <div className="text-xs text-gray-500 mt-1">{method.description}</div>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* 套餐列表 */}
                        <div>
                            <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 mb-3">选择套餐</h2>
                            <div className="grid gap-4">
                                {plans.map(plan => (
                                    <button
                                        key={plan.id}
                                        onClick={() => setSelectedPlan(plan)}
                                        className={`relative p-5 rounded-2xl border-2 text-left transition-all ${
                                            selectedPlan?.id === plan.id
                                                ? 'border-amber-500 bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 shadow-lg'
                                                : 'border-gray-200 dark:border-gray-800 hover:border-amber-300 dark:hover:border-amber-700 bg-white dark:bg-gray-900'
                                        }`}
                                    >
                                        {plan.is_popular && (
                                            <div className="absolute -top-2 right-4 bg-amber-500 text-white text-xs px-2 py-0.5 rounded-full flex items-center gap-1">
                                                <Star className="w-3 h-3" />
                                                热门
                                            </div>
                                        )}
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <h3 className="text-lg font-bold text-gray-900 dark:text-white">{plan.name}</h3>
                                                {plan.description && (
                                                    <p className="text-sm text-gray-500 mt-1">{plan.description}</p>
                                                )}
                                                <div className="flex items-center gap-2 mt-3">
                                                    <TrendingUp className="w-4 h-4 text-amber-500" />
                                                    <span className="text-2xl font-bold text-amber-600">{plan.credits}</span>
                                                    <span className="text-gray-500">积分</span>
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <div className="text-2xl font-bold text-gray-900 dark:text-white">
                                                    ${plan.price_usd}
                                                </div>
                                                <div className="text-sm text-gray-500">USDT</div>
                                            </div>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* 购买按钮 */}
                        <div className="flex justify-end">
                            <button
                                onClick={handleCreateOrder}
                                disabled={!selectedPlan || loading}
                                className="px-8 py-4 bg-gradient-to-r from-amber-500 to-orange-500 text-white font-bold rounded-xl hover:from-amber-600 hover:to-orange-600 disabled:opacity-50 disabled:cursor-not-allowed transition shadow-lg shadow-amber-500/30 flex items-center gap-2"
                            >
                                {loading ? (
                                    <>
                                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                        处理中...
                                    </>
                                ) : (
                                    <>
                                        <CreditCard className="w-5 h-5" />
                                        立即购买 {selectedPlan && `- ${selectedPlan.credits} 积分`}
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                )}

                {/* 步骤2: 支付中 */}
                {step === 'payment' && order && paymentInfo && (
                    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
                        {/* 倒计时 */}
                        {timeRemaining > 0 && (
                            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-900/30 rounded-xl p-4 flex items-center justify-between">
                                <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
                                    <Clock className="w-5 h-5" />
                                    <span className="font-medium">请在剩余时间内完成支付</span>
                                </div>
                                <div className="text-xl font-mono font-bold text-amber-600">
                                    {formatTimeRemaining(timeRemaining)}
                                </div>
                            </div>
                        )}

                        {/* 订单信息 */}
                        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 overflow-hidden">
                            <div className="p-6 border-b border-gray-200 dark:border-gray-800">
                                <h3 className="font-bold text-gray-900 dark:text-white">订单信息</h3>
                            </div>
                            <div className="p-6 space-y-4">
                                <div className="flex justify-between">
                                    <span className="text-gray-500">订单号</span>
                                    <span className="font-mono text-gray-900 dark:text-white">{order.trade_no}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-gray-500">套餐</span>
                                    <span className="font-medium text-gray-900 dark:text-white">{order.credits} 积分</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-gray-500">支付方式</span>
                                    <span className="font-medium text-gray-900 dark:text-white">
                                        {formatPaymentMethod(order.payment_method as PaymentMethod)}
                                    </span>
                                </div>
                                <div className="flex justify-between text-lg">
                                    <span className="text-gray-500">支付金额</span>
                                    <span className="font-bold text-amber-600">
                                        {paymentInfo.expected_amount} USDT
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* 支付信息 */}
                        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 overflow-hidden">
                            <div className="p-6 border-b border-gray-200 dark:border-gray-800">
                                <h3 className="font-bold text-gray-900 dark:text-white flex items-center gap-2">
                                    <Wallet className="w-5 h-5 text-amber-500" />
                                    支付信息
                                </h3>
                            </div>
                            <div className="p-6 space-y-6">
                                {/* 二维码 */}
                                {paymentInfo.qr_code_url && (
                                    <div className="flex justify-center">
                                        <div className="bg-white p-4 rounded-2xl shadow-inner">
                                            <img
                                                src={paymentInfo.qr_code_url}
                                                alt="支付二维码"
                                                className="w-48 h-48"
                                            />
                                        </div>
                                    </div>
                                )}

                                {/* 收款地址 */}
                                <div>
                                    <div className="text-sm text-gray-500 mb-2">收款地址 ({paymentInfo.network})</div>
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="text"
                                            readOnly
                                            value={paymentInfo.wallet_address}
                                            className="flex-1 px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm font-mono"
                                        />
                                        <button
                                            onClick={handleCopyAddress}
                                            className="px-4 py-3 bg-amber-500 text-white rounded-xl hover:bg-amber-600 transition flex items-center gap-2"
                                        >
                                            {copied ? <CheckCircle className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                                            {copied ? '已复制' : '复制'}
                                        </button>
                                    </div>
                                </div>

                                {/* 提示信息 */}
                                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-900/30 rounded-xl p-4 text-sm text-blue-700 dark:text-blue-400">
                                    <p className="font-medium mb-2">支付说明：</p>
                                    <ul className="space-y-1 text-xs">
                                        <li>• 请使用 <strong>{paymentInfo.network}</strong> 网络转账 USDT</li>
                                        <li>• 转账金额需为 <strong>{paymentInfo.expected_amount} USDT</strong></li>
                                        <li>• 支付成功后将生成兑换码，需兑换后积分到账</li>
                                        <li>• 兑换码仅可使用一次</li>
                                        <li>• 请勿使用其他网络转账，否则无法到账</li>
                                    </ul>
                                </div>

                                {/* 订单状态 */}
                                <div className="text-center py-4">
                                    <div className="inline-flex items-center gap-2 px-6 py-3 bg-gray-100 dark:bg-gray-800 rounded-full">
                                        <div className="w-2 h-2 bg-amber-500 rounded-full animate-pulse" />
                                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                            等待支付中...
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* 取消按钮 */}
                        <div className="flex justify-center">
                            <button
                                onClick={handleCancelOrder}
                                className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 text-sm"
                            >
                                取消订单
                            </button>
                        </div>
                    </div>
                )}

                {/* 步骤3: 支付成功 */}
                {step === 'success' && order && (
                    <div className="space-y-6 animate-in fade-in zoom-in-95 duration-300">
                        <div className="text-center py-12">
                            <div className="w-20 h-20 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-6">
                                <CheckCircle className="w-10 h-10 text-green-500" />
                            </div>
                            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">支付成功！</h2>
                            <p className="text-gray-500">您已获得 {order.credits} 积分兑换码</p>
                        </div>

                        <div className="bg-amber-50 dark:bg-amber-900/20 rounded-2xl border border-amber-200 dark:border-amber-900/40 p-6">
                            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                                <div>
                                    <h3 className="text-sm font-bold text-amber-700 dark:text-amber-300">兑换码</h3>
                                    <p className="text-xs text-amber-600/80 dark:text-amber-200/70">在账号面板输入兑换码即可入账</p>
                                </div>
                                <button
                                    onClick={handleCopyRedeemCode}
                                    disabled={!order.redeem_code}
                                    className="px-4 py-2 rounded-xl border border-amber-300/70 dark:border-amber-800 text-amber-700 dark:text-amber-200 bg-white/70 dark:bg-gray-900/40 hover:bg-white dark:hover:bg-gray-900 transition flex items-center gap-2 disabled:opacity-50"
                                >
                                    {copiedRedeem ? <CheckCircle className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                                    {copiedRedeem ? '已复制' : '复制兑换码'}
                                </button>
                            </div>
                            <div className="mt-4 rounded-xl bg-white dark:bg-gray-900 border border-amber-200 dark:border-amber-900/60 px-4 py-3">
                                <div className="font-mono text-lg tracking-widest text-amber-800 dark:text-amber-200 text-center">
                                    {order.redeem_code || '兑换码生成中...'}
                                </div>
                            </div>
                            <p className="mt-3 text-xs text-amber-700 dark:text-amber-300">每个兑换码仅可使用一次，积分永久保留。</p>
                        </div>

                        {/* 订单详情 */}
                        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6">
                            <h3 className="font-bold text-gray-900 dark:text-white mb-4">订单详情</h3>
                            <div className="space-y-3 text-sm">
                                <div className="flex justify-between">
                                    <span className="text-gray-500">订单号</span>
                                    <span className="font-mono">{order.trade_no}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-gray-500">兑换码积分</span>
                                    <span className="font-medium text-amber-600">+{order.credits}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-gray-500">支付金额</span>
                                    <span>{order.received_amount || order.expected_amount} USDT</span>
                                </div>
                                {order.tx_hash && (
                                    <div className="flex justify-between">
                                        <span className="text-gray-500">交易哈希</span>
                                        <span className="font-mono text-xs">{order.tx_hash.slice(0, 16)}...</span>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* 完成按钮 */}
                        <div className="flex justify-center">
                            <button
                                onClick={() => {
                                    setStep('select');
                                    setOrder(null);
                                    setPaymentInfo(null);
                                    if (onClose) onClose();
                                }}
                                className="px-8 py-4 bg-gradient-to-r from-green-500 to-emerald-500 text-white font-bold rounded-xl hover:from-green-600 hover:to-emerald-600 transition shadow-lg"
                            >
                                完成
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
