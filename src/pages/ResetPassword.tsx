import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Heart, Loader2 } from "lucide-react";
import { errorMessage } from "@/lib/utils";

// Landing page for the password reset email link. Supabase signs the user in from the
// link, so a session is present here and the new password can be set directly.
export default function ResetPassword() {
  const { session, loading } = useAuth();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) {
      toast({ title: "Passwords don't match", variant: "destructive" });
      return;
    }
    setSaving(true);
    const { error } = await supabase.auth.updateUser({ password });
    setSaving(false);
    if (error) {
      toast({ title: "Error", description: errorMessage(error), variant: "destructive" });
    } else {
      toast({ title: "Password updated" });
      navigate("/dashboard", { replace: true });
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary/10 mb-2">
            <Heart className="h-7 w-7 text-primary" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight">Harmony Health Hub</h1>
        </div>

        <Card>
          <CardHeader className="pb-4">
            <CardTitle>Set a New Password</CardTitle>
            <CardDescription>
              {session ? "Choose a new password for your account" : "Open this page from the link in your password reset email"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex justify-center py-6"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
            ) : session ? (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="password">New Password</Label>
                  <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} autoComplete="new-password" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirm">Confirm Password</Label>
                  <Input id="confirm" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required minLength={6} autoComplete="new-password" />
                </div>
                <Button type="submit" className="w-full" disabled={saving}>
                  {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Update Password
                </Button>
              </form>
            ) : (
              <div className="space-y-4 text-center">
                <p className="text-sm text-muted-foreground">This reset link is invalid or has expired.</p>
                <Button asChild variant="outline" className="w-full"><Link to="/auth">Back to sign in</Link></Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
