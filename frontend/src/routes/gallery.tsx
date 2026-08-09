import { createFileRoute } from '@tanstack/react-router';
import { GalleryPanel } from '../components/gallery/GalleryPanel';

export const Route = createFileRoute('/gallery')({
  component: GalleryPanel,
});
