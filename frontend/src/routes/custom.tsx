import { createFileRoute } from '@tanstack/react-router';
import { CustomPanel } from '../components/custom/CustomPanel';

export const Route = createFileRoute('/custom')({
  component: CustomPanel,
});
