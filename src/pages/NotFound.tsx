import { useLocation, useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

const NotFound = () => {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="auth-container">
      <div className="auth-glow" />
      <div className="relative z-10 text-center space-y-6 max-w-md mx-auto">
        <div className="space-y-2">
          <h1 className="text-8xl font-heading font-bold text-primary tabular-nums">404</h1>
          <h2 className="text-2xl font-heading font-semibold text-foreground">Page not found</h2>
          <p className="text-muted-foreground">
            The page you're looking for doesn't exist or has been moved.
          </p>
        </div>
        <Button
          onClick={() => navigate("/")}
          className="auth-button inline-flex items-center justify-center gap-2 max-w-xs"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Home
        </Button>
      </div>
    </div>
  );
};

export default NotFound;
