import React from 'react';

export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`animate-pulse bg-gray-200 rounded ${className}`} {...props} />
  );
}

export function SkeletonText({ lines = 1, className }: { lines?: number; className?: string }) {
  return (
    <div className={`space-y-2 ${className}`}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className={`h-4 w-${i === lines - 1 && lines > 1 ? '2/3' : 'full'}`} />
      ))}
    </div>
  );
}

export function SkeletonCard({ className }: { className?: string }) {
  return (
    <div className={`p-4 border border-gray-100 rounded-xl bg-white shadow-sm space-y-4 ${className}`}>
      <Skeleton className="h-10 w-10 rounded-full" />
      <SkeletonText lines={3} />
    </div>
  );
}
