/**
 * 滑块验证组件（简化版）
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle2, ChevronsRight } from 'lucide-react';
import { getSliderChallenge, verifySliderCaptcha, SliderChallenge } from '../services/authService';

interface SliderCaptchaProps {
  purpose: 'register' | 'login' | 'reset';
  onVerified: (ticket: string) => void;
  onCancel?: () => void;
}

const DEFAULT_TRACK_WIDTH = 320;
const DEFAULT_HANDLE_WIDTH = 44;
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
  const dragOffsetRef = useRef(0);
  const dragXRef = useRef(0);

  const trackWidth = challenge?.track_width ?? DEFAULT_TRACK_WIDTH;
  const handleWidth = challenge?.handle_width ?? DEFAULT_HANDLE_WIDTH;
  const maxHandleX = Math.max(0, trackWidth - handleWidth);

  const resetDrag = useCallback(() => {
    setDragX(0);
    setIsDragging(false);
    dragXRef.current = 0;
    dragOffsetRef.current = 0;
  }, []);

  const loadChallenge = useCallback(async () => {
    setStatus('loading');
    setError('');
    setChallenge(null);
    resetDrag();

    try {
      const data = await getSliderChallenge();
      if (!data.challenge_id) {
        setError('加载失败，请重试');
        setStatus('error');
        return;
      }
      setChallenge(data);
      setStatus('idle');
    } catch (err) {
      setError('加载失败，请重试');
      setStatus('error');
    }
  }, [resetDrag]);

  useEffect(() => {
    loadChallenge();
  }, [loadChallenge]);

  const beginDrag = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!challenge || status !== 'idle') return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;

      const trackRect = trackRef.current?.getBoundingClientRect();
      if (!trackRect) {
        resetDrag();
        return;
      }

      e.currentTarget.setPointerCapture(e.pointerId);
      setIsDragging(true);
      setError('');
      dragOffsetRef.current = e.clientX - (trackRect.left + dragXRef.current);
    },
    [challenge, resetDrag, status]
  );

  const updateDrag = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!isDragging || status !== 'idle') return;
      const trackRect = trackRef.current?.getBoundingClientRect();
      if (!trackRect) return;

      const rawX = e.clientX - trackRect.left - dragOffsetRef.current;
      const nextX = Math.min(Math.max(0, rawX), maxHandleX);
      dragXRef.current = nextX;
      setDragX(nextX);
    },
    [isDragging, maxHandleX, status]
  );

  const cancelDrag = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!isDragging) return;
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // Ignore release errors for pointers not captured.
      }
      resetDrag();
    },
    [isDragging, resetDrag]
  );

  const finishDrag = useCallback(
    async (e: React.PointerEvent<HTMLDivElement>) => {
      if (!isDragging || status !== 'idle' || !challenge) return;
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // Ignore release errors for pointers not captured.
      }

      setIsDragging(false);
      setStatus('verifying');

      try {
        const response = await verifySliderCaptcha({
          challenge_id: challenge.challenge_id,
          final_x: dragXRef.current,
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
    },
    [challenge, isDragging, loadChallenge, onVerified, purpose, status]
  );

  const progressWidth = Math.min(trackWidth, dragX + handleWidth / 2);

  return (
    <div className="w-full space-y-3">
      <div
        ref={trackRef}
        className="relative mx-auto rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-700/60 overflow-hidden"
        style={{ width: `${trackWidth}px`, height: `${TRACK_HEIGHT}px` }}
      >
        <div
          className="absolute inset-y-0 left-0 bg-green-500/20 dark:bg-green-500/30 transition-all duration-0"
          style={{ width: `${progressWidth}px` }}
        />
        <div
          onPointerDown={beginDrag}
          onPointerMove={updateDrag}
          onPointerUp={finishDrag}
          onPointerCancel={cancelDrag}
          className={`absolute top-1 bottom-1 rounded-lg flex items-center justify-center cursor-pointer shadow-sm transition-transform active:scale-95 ${
            status === 'success'
              ? 'bg-green-500 text-white'
              : 'bg-white dark:bg-gray-600 text-gray-500 dark:text-gray-200'
          } ${status !== 'idle' ? 'opacity-70 cursor-not-allowed' : ''}`}
          style={{
            width: `${handleWidth}px`,
            transform: `translateX(${dragX}px)`,
            touchAction: 'none',
          }}
        >
          {status === 'success' ? (
            <CheckCircle2 className="w-5 h-5" />
          ) : (
            <ChevronsRight className={`w-5 h-5 ${isDragging ? 'opacity-100' : 'opacity-70'}`} />
          )}
        </div>
        <div className="absolute inset-0 flex items-center justify-center text-xs text-gray-400 dark:text-gray-500 pointer-events-none">
          {status === 'success' ? '验证通过' : status === 'verifying' ? '验证中...' : '向右拖动验证'}
        </div>
      </div>

      {error && (
        <div className="text-xs text-red-500 text-center">{error}</div>
      )}

      {status === 'error' && (
        <button
          type="button"
          onClick={loadChallenge}
          className="w-full text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
        >
          重新加载
        </button>
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
