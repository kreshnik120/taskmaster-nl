import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Target, Zap } from "lucide-react";
import { useNavigate } from "react-router-dom";

export function ValidationOnboardingWizard() {
  const [showWizard, setShowWizard] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const hasSeenWizard = localStorage.getItem('validation_wizard_completed');
    const isFirstVisit = !hasSeenWizard;
    
    if (isFirstVisit) {
      // Delay to allow page to load
      const timer = setTimeout(() => setShowWizard(true), 1000);
      return () => clearTimeout(timer);
    }
  }, []);

  const startGuidedValidation = () => {
    localStorage.setItem('validation_wizard_completed', 'true');
    setShowWizard(false);
    navigate('/ai-training?tab=validation');
  };

  const skipWizard = () => {
    localStorage.setItem('validation_wizard_completed', 'true');
    setShowWizard(false);
  };

  return (
    <Dialog open={showWizard} onOpenChange={setShowWizard}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-2xl">
            <Target className="h-6 w-6 text-primary" />
            🎯 Quick Start: Validate Your First Knowledge Items
          </DialogTitle>
          <DialogDescription className="text-base mt-2">
            Your AI's quality depends on verified knowledge. Let's validate 10 items together!
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div className="flex items-start gap-3">
            <div className="bg-primary/10 rounded-full p-2 mt-0.5">
              <span className="text-lg font-bold text-primary">1</span>
            </div>
            <div>
              <h4 className="font-semibold">Filter by "Quick Wins"</h4>
              <p className="text-sm text-muted-foreground">Focus on high-confidence items (80%+) for fast approval</p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className="bg-primary/10 rounded-full p-2 mt-0.5">
              <span className="text-lg font-bold text-primary">2</span>
            </div>
            <div>
              <h4 className="font-semibold">Review Content vs. Source</h4>
              <p className="text-sm text-muted-foreground">Check if the extracted knowledge matches the original document</p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className="bg-primary/10 rounded-full p-2 mt-0.5">
              <span className="text-lg font-bold text-primary">3</span>
            </div>
            <div>
              <h4 className="font-semibold">Click ✅ Verify or ❌ Reject</h4>
              <p className="text-sm text-muted-foreground">Build momentum with celebration effects every 10 validations!</p>
            </div>
          </div>

          <div className="bg-gradient-to-r from-blue-500/10 to-purple-600/10 p-4 rounded-lg border border-primary/20 mt-4">
            <div className="flex items-center gap-2 mb-2">
              <Zap className="h-5 w-5 text-primary" />
              <span className="font-semibold">⚡ Time Investment</span>
            </div>
            <p className="text-sm text-muted-foreground">
              First 10 items: ~2 minutes | Daily goal: 50 items (~10 min)
            </p>
          </div>

          <div className="bg-green-500/10 p-4 rounded-lg border border-green-500/20">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
              <span className="font-semibold text-green-600">Expected Impact</span>
            </div>
            <p className="text-sm text-muted-foreground">
              Verified knowledge improves AI accuracy by 40-60% for affected topics
            </p>
          </div>
        </div>

        <div className="flex gap-2 mt-4">
          <Button 
            variant="outline" 
            onClick={skipWizard}
            className="flex-1"
          >
            Skip for now
          </Button>
          <Button 
            onClick={startGuidedValidation}
            className="flex-1 bg-gradient-to-r from-blue-500 to-purple-600"
          >
            Start Validating (2 min) →
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
