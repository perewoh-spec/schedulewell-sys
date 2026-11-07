import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Heart, Loader2 } from "lucide-react";
import { errorMessage } from "@/lib/utils";
import { DEMO_ACCOUNTS, DEMO_MODE, DEMO_PASSWORD } from "@/lib/demo";

export default function Auth() {
  const [isLogin, setIsLogin] = useState(true);
  const [forgot, setForgot] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);
  const [demoLoading, setDemoLoading] = useState<string | null>(null);
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (forgot) {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}${import.meta.env.BASE_URL}reset-password`,
        });
        if (error) throw error;
        toast({ title: "Check your email", description: "We sent you a link to reset your password." });
        setForgot(false);
      } else if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate("/dashboard");
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { full_name: fullName }, emailRedirectTo: `${window.location.origin}${import.meta.env.BASE_URL}` },
        });
        if (error) throw error;
        toast({ title: "Account created!", description: "Check your email to confirm your account, then sign in." });
        setIsLogin(true);
        setPassword("");
      }
    } catch (error) {
      toast({ title: "Error", description: errorMessage(error), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const signInDemo = async (email: string) => {
    setDemoLoading(email);
    const { error } = await supabase.auth.signInWithPassword({ email, password: DEMO_PASSWORD });
    setDemoLoading(null);
    if (error) {
      toast({ title: "Demo unavailable", description: errorMessage(error), variant: "destructive" });
    } else {
      navigate("/dashboard");
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
          <p className="text-muted-foreground text-sm">Hospital Appointment & Records Management</p>
        </div>

        <Card>
          <CardHeader className="pb-4">
            <CardTitle>{forgot ? "Reset Password" : isLogin ? "Sign In" : "Create Account"}</CardTitle>
            <CardDescription>
              {forgot
                ? "Enter your email and we'll send you a reset link"
                : isLogin ? "Enter your credentials to access the system" : "Register as a new patient"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {!isLogin && !forgot && (
                <div className="space-y-2">
                  <Label htmlFor="fullName">Full Name</Label>
                  <Input id="fullName" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Your full name" autoComplete="name" required />
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" required />
              </div>
              {!forgot && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password">Password</Label>
                    {isLogin && (
                      <button type="button" onClick={() => setForgot(true)} className="text-xs text-primary hover:underline">
                        Forgot password?
                      </button>
                    )}
                  </div>
                  <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required minLength={6}
                    autoComplete={isLogin ? "current-password" : "new-password"} />
                </div>
              )}
              <Button type="submit" className="w-full" disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {forgot ? "Send Reset Link" : isLogin ? "Sign In" : "Create Account"}
              </Button>
            </form>
            <div className="mt-4 text-center">
              {forgot ? (
                <button type="button" onClick={() => setForgot(false)} className="text-sm text-primary hover:underline">
                  Back to sign in
                </button>
              ) : (
                <button type="button" onClick={() => setIsLogin(!isLogin)} className="text-sm text-primary hover:underline">
                  {isLogin ? "Don't have an account? Sign up" : "Already have an account? Sign in"}
                </button>
              )}
            </div>
          </CardContent>
        </Card>

        {DEMO_MODE && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Try the demo</CardTitle>
              <CardDescription>
                See each side of the system with a sample account. The demo only shows placeholder data (made-up patients,
                appointments and records), kept completely separate from real accounts.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-2 sm:grid-cols-3">
              {DEMO_ACCOUNTS.map((a) => (
                <Button
                  key={a.email}
                  type="button"
                  variant="outline"
                  className="h-auto flex-col items-start gap-0.5 py-2 text-left whitespace-normal"
                  disabled={!!demoLoading}
                  onClick={() => signInDemo(a.email)}
                >
                  <span className="flex items-center font-semibold">
                    {demoLoading === a.email && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                    {a.label}
                  </span>
                  <span className="text-xs font-normal text-muted-foreground">{a.description}</span>
                </Button>
              ))}
            </CardContent>
          </Card>
        )}

        <p className="text-xs text-center text-muted-foreground">
          Sign in or create an account to continue
        </p>
      </div>
    </div>
  );
}
