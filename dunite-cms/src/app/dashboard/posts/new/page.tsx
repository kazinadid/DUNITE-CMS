import { redirect } from 'next/navigation';

// `/dashboard/posts/new` was an early scratch route.  The canonical creation
// surface is the full composer at `/dashboard/posts/compose`, so redirect
// permanently to keep external links and bookmarks working.
export default function NewPostPage(): never {
  redirect('/dashboard/posts/compose');
}
