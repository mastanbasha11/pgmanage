import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Mail, Clock } from 'lucide-react';

interface Props {
  ownerName?: string;
  ownerEmail?: string;
}

export default function PendingApprovalPage({ ownerName, ownerEmail }: Props) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-amber-100 text-amber-700">
            <Clock className="h-7 w-7" />
          </div>
          <CardTitle>Pending admin approval</CardTitle>
          <CardDescription>
            {ownerName ? `Hi ${ownerName} — your` : 'Your'} PGManage account is waiting for the
            platform admin to review and approve it.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border bg-muted/40 px-4 py-3 text-sm">
            <p className="font-medium">What happens next</p>
            <ol className="mt-2 list-decimal pl-4 text-muted-foreground space-y-1">
              <li>The admin gets an email with your details.</li>
              <li>Once approved (usually within 24 hours), {ownerEmail || 'your email'} will get a confirmation.</li>
              <li>You can then log in and start setting up your PG.</li>
            </ol>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Mail className="h-3.5 w-3.5" />
            Need help faster? Email{' '}
            <a className="text-accent font-medium" href="mailto:mastanbasha11@gmail.com">
              mastanbasha11@gmail.com
            </a>
          </div>
          <p className="text-center text-xs text-muted-foreground">
            <Link to="/auth/login" className="hover:underline">
              Back to sign in
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
