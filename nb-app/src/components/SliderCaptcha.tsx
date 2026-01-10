/**
 * 滑块验证组件
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, ChevronsRight, RefreshCw } from 'lucide-react';
import {
  getSliderChallenge,
  verifySliderCaptcha,
  SliderChallenge,
  SliderTracePoint,
} from '../services/authService';

interface SliderCaptchaProps {
  purpose: 'register' | 'login' | 'reset';
  onVerified: (ticket: string) => void;
  onCancel?: () => void;
}

const HANDLE_WIDTH = 44;
const TRACK_HEIGHT = 44;

export const SliderCaptcha: React.FC<SliderCaptchaProps> = ({
  purpose,
  onVerified,
  onCancel,
}) => {
  const [challenge, setChallenge] = useState<SliderChallenge | null>(null);
  const [status, setStatus] = useState<'loading' | 'idle' | 'verifying' | 'success' | 'error'>('loading');
  const [error, setError] = useState('');
  const [dragX, setDragX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  const trackRef = useRef<HTMLDivElement>(null);
  const traceRef = useRef<SliderTracePoint[]>([]);
  const startTimeRef = useRef(0);
  const lastSampleRef = useRef(0);
  const dragOffsetRef = useRef(0);
  const dragXRef = useRef(0);

  const trackWidth = challenge?.w ?? 320;
  const maxHandleX = Math.max(0, trackWidth - HANDLE_WIDTH);
  const maxPieceX = Math.max(0, (challenge?.w ?? 0) - (challenge?.piece_size ?? 0));

  const calcPieceX = useCallback(
    (handleX: number) => {
      if (!challenge || maxHandleX <= 0) return 0;
      return (handleX / maxHandleX) * maxPieceX;
    },
    [challenge, maxHandleX, maxPieceX]
  );

  const pieceX = useMemo(() => calcPieceX(dragX), [calcPieceX, dragX]);

  const loadChallenge = useCallback(async () => {
    setStatus('loading');
    setError('');
    setChallenge(null);
    setDragX(0);
    traceRef.current = [];

    try {
      const data = await getSliderChallenge();
      setChallenge(data);
      setStatus('idle');
    } catch (err) {
      setError('加载失败，请重试');
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    loadChallenge();
  }, [loadChallenge]);

  const pushTrace = useCallback((t: number, x: number, y: number, e?: PointerEvent) => {
    traceRef.current.push({
      t: Math.max(0, Math.round(t)),
      x,
      y,
      pt: e?.pointerType,
      it: e?.isTrusted,
    });
  }, []);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!challenge || status !== 'idle') return;

      setIsDragging(true);
      setError('');

      const trackRect = trackRef.current?.getBoundingClientRect();
      const handleLeft = dragX;
      dragOffsetRef.current = trackRect ? e.clientX - (trackRect.left + handleLeft) : 0;

      startTimeRef.current = performance.now();
      lastSampleRef.current = 0;
      traceRef.current = [];
      pushTrace(0, pieceX, challenge.piece_y, e.nativeEvent);
    },
    [challenge, dragX, pieceX, pushTrace, status]
  );

  const handlePointerMove = useCallback(
    (e: PointerEvent) => {
      if (!isDragging || !challenge || status !== 'idle') return;
      const trackRect = trackRef.current?.getBoundingClientRect();
      if (!trackRect) return;

      const rawX = e.clientX - trackRect.left - dragOffsetRef.current;
      const nextX = Math.min(Math.max(0, rawX), maxHandleX);

      dragXRef.current = nextX;
      setDragX(nextX);

      const now = performance.now();
      if (now - lastSampleRef.current >= 16) {
        const t = now - startTimeRef.current;
        pushTrace(t, calcPieceX(nextX), challenge.piece_y, e);
        lastSampleRef.current = now;
      }
    },
    [calcPieceX, challenge, isDragging, maxHandleX, pushTrace, status]
  );

  const handleVerify = useCallback(async () => {
    if (!challenge) return;

    setStatus('verifying');
    setIsDragging(false);

    const finalHandleX = dragXRef.current;
    const finalPieceX = calcPieceX(finalHandleX);
    const now = performance.now();
    pushTrace(now - startTimeRef.current, finalPieceX, challenge.piece_y);

    try {
      const response = await verifySliderCaptcha({
        challenge_id: challenge.challenge_id,
        final_x: finalPieceX,
        trace: traceRef.current,
        dpr: window.devicePixelRatio || 1,
        use: purpose,
      });

      if (response.ok && response.ticket) {
        setStatus('success');
        onVerified(response.ticket);
        return;
      }

      setError('验证失败，请重试');
      await loadChallenge();
    } catch (err) {
      setError('验证失败，请重试');
      setStatus('error');
    }
  }, [calcPieceX, challenge, loadChallenge, onVerified, pushTrace, purpose]);

  const handlePointerUp = useCallback(() => {
    if (!isDragging || status !== 'idle') return;
    handleVerify();
  }, [handleVerify, isDragging, status]);

  useEffect(() => {
    if (!isDragging) return;
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [handlePointerMove, handlePointerUp, isDragging]);

  const progressWidth = Math.min(trackWidth, dragX + HANDLE_WIDTH / 2);

  return (
    <div className="w-full space-y-3">
      <div className="relative rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
        <div
          className="relative"
          style={{ width: `${trackWidth}px`, height: `${challenge?.h ?? 160}px` }}
        >
          {challenge ? (
            <>
              <img
                src={challenge.bg}
                alt="captcha"
                className="w-full h-full block select-none"
                draggable={false}
              />
              <img
                src={challenge.piece}
                alt="piece"
                className="absolute select-none drop-shadow-md"
                style={{
                  width: `${challenge.piece_size}px`,
                  height: `${challenge.piece_size}px`,
                  transform: `translate(${pieceX}px, ${challenge.piece_y}px)`,
                }}
                draggable={false}
              />
            </>
          ) : (
            <div className="w-full h-full flex items-center justify-center text-sm text-gray-400">
              加载中...
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={loadChallenge}
          disabled={status === 'verifying'}
          className="absolute top-2 right-2 p-1.5 rounded-lg bg-white/80 dark:bg-gray-700/80 text-gray-600 dark:text-gray-200 hover:bg-white dark:hover:bg-gray-700 transition-colors"
          aria-label="刷新验证码"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      <div
        ref={trackRef}
        className="relative rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-700/60 overflow-hidden"
        style={{ width: `${trackWidth}px`, height: `${TRACK_HEIGHT}px` }}
      >
        <div
          className="absolute inset-y-0 left-0 bg-green-500/20 dark:bg-green-500/30 transition-all duration-0"
          style={{ width: `${progressWidth}px` }}
        />
        <div
          onPointerDown={handlePointerDown}
          className={`absolute top-1 bottom-1 w-11 rounded-lg flex items-center justify-center cursor-pointer shadow-sm transition-transform active:scale-95 ${
            status === 'success'
              ? 'bg-green-500 text-white'
              : 'bg-white dark:bg-gray-600 text-gray-500 dark:text-gray-200'
          } ${status !== 'idle' ? 'opacity-70 cursor-not-allowed' : ''}`}
          style={{ transform: `translateX(${dragX}px)` }}
        >
          {status === 'success' ? (
            <CheckCircle2 className="w-5 h-5" />
          ) : (
            <ChevronsRight className={`w-5 h-5 ${isDragging ? 'opacity-100' : 'opacity-70'}`} />
          )}
        </div>
        <div className="absolute inset-0 flex items-center justify-center text-xs text-gray-400 dark:text-gray-500 pointer-events-none">
          {status === 'success' ? '验证通过' : status === 'verifying' ? '验证中...' : '向右拖动完成拼图'}
        </div>
      </div>

      {error && (
        <div className="text-xs text-red-500 text-center">{error}</div>
      )}
      {onCancel && (
        <button
          type="button"
          onClick={onCancel}
          className="w-full text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
        >
          取消
        </button>
      )}
    </div>
  );
};
