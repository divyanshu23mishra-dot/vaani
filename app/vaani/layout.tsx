import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Vaani AI',
};

export default function VaaniLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
