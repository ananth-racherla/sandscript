import { createFileRoute } from '@tanstack/react-router';
import { PrintPanel } from '../components/print/PrintPanel';

export const Route = createFileRoute('/print')({
  component: PrintPanel,
});
