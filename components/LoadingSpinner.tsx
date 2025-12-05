interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  color?: string;
  message?: string;
}

export function LoadingSpinner({
  size = 'md',
  color = '#0084FE',
  message
}: LoadingSpinnerProps) {
  const sizeClasses = {
    sm: 'w-1.5 h-1.5',
    md: 'w-2 h-2',
    lg: 'w-2.5 h-2.5'
  };

  const gapClasses = {
    sm: 'gap-1',
    md: 'gap-1.5',
    lg: 'gap-2'
  };

  return (
    <div className="flex flex-col items-center justify-center">
      <div className={`flex ${gapClasses[size]}`}>
        <div
          className={`${sizeClasses[size]} rounded-full animate-bounce`}
          style={{
            backgroundColor: color,
            animationDelay: '0s',
            animationDuration: '0.6s'
          }}
        />
        <div
          className={`${sizeClasses[size]} rounded-full animate-bounce`}
          style={{
            backgroundColor: color,
            animationDelay: '0.1s',
            animationDuration: '0.6s'
          }}
        />
        <div
          className={`${sizeClasses[size]} rounded-full animate-bounce`}
          style={{
            backgroundColor: color,
            animationDelay: '0.2s',
            animationDuration: '0.6s'
          }}
        />
      </div>
      {message && (
        <p className="mt-3 text-sm text-gray-600">{message}</p>
      )}
    </div>
  );
}
