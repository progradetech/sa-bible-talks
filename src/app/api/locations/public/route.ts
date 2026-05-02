import { listPublic } from '@/lib/repos/leaders';

export const revalidate = 60;

export async function GET() {
  const locations = await listPublic();
  return Response.json(locations, {
    headers: {
      'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
    },
  });
}
