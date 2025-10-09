import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle, XCircle, AlertCircle, BookOpen } from "lucide-react";

export function ValidationWorkflowGuide() {
  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BookOpen className="h-5 w-5" />
          Knowledge Validation Workflow - Quick Start Guide
        </CardTitle>
        <CardDescription>
          Follow this SOP to validate and maintain knowledge base quality
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Workflow Steps */}
        <div className="space-y-4">
          <div className="flex gap-3">
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center font-bold text-primary">
              1
            </div>
            <div>
              <h4 className="font-semibold mb-1">Filter items needing review</h4>
              <p className="text-sm text-muted-foreground">
                Use the status filter to select <strong>"Pending Review"</strong> items. 
                Start with high-confidence items (≥0.8) in critical categories like "compliance" or "hr_*".
              </p>
            </div>
          </div>

          <div className="flex gap-3">
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center font-bold text-primary">
              2
            </div>
            <div>
              <h4 className="font-semibold mb-1">Review knowledge items</h4>
              <p className="text-sm text-muted-foreground">
                Check each item for:
                <ul className="list-disc list-inside mt-2 space-y-1">
                  <li><strong>Accuracy:</strong> Is the information correct and up-to-date?</li>
                  <li><strong>Completeness:</strong> Does it contain all necessary details?</li>
                  <li><strong>Source Quality:</strong> Is the source tier 1 (official) or tier 2 (reliable)?</li>
                  <li><strong>PII Compliance:</strong> No personal identifiable information exposed?</li>
                </ul>
              </p>
            </div>
          </div>

          <div className="flex gap-3">
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center font-bold text-primary">
              3
            </div>
            <div>
              <h4 className="font-semibold mb-1">Take action</h4>
              <p className="text-sm text-muted-foreground">
                Select items and use bulk actions:
              </p>
              <div className="grid grid-cols-3 gap-3 mt-3">
                <Card className="border-green-200 dark:border-green-800">
                  <CardContent className="pt-3 pb-3">
                    <CheckCircle className="h-5 w-5 text-green-600 mb-1" />
                    <p className="text-xs font-medium">Approve</p>
                    <p className="text-xs text-muted-foreground">Mark as verified</p>
                  </CardContent>
                </Card>
                <Card className="border-yellow-200 dark:border-yellow-800">
                  <CardContent className="pt-3 pb-3">
                    <AlertCircle className="h-5 w-5 text-yellow-600 mb-1" />
                    <p className="text-xs font-medium">Review</p>
                    <p className="text-xs text-muted-foreground">Flag for deeper analysis</p>
                  </CardContent>
                </Card>
                <Card className="border-red-200 dark:border-red-800">
                  <CardContent className="pt-3 pb-3">
                    <XCircle className="h-5 w-5 text-red-600 mb-1" />
                    <p className="text-xs font-medium">Reject</p>
                    <p className="text-xs text-muted-foreground">Mark as invalid</p>
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>

          <div className="flex gap-3">
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center font-bold text-primary">
              4
            </div>
            <div>
              <h4 className="font-semibold mb-1">Monitor progress</h4>
              <p className="text-sm text-muted-foreground">
                Track validation statistics at the top of the page. 
                Aim for <strong>&gt;90% verified</strong> knowledge base quality score.
              </p>
            </div>
          </div>
        </div>

        {/* Best Practices */}
        <div className="border-t pt-4">
          <h4 className="font-semibold mb-2">📋 Best Practices</h4>
          <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
            <li><strong>Daily validation:</strong> Process 50-100 items per day to prevent backlog</li>
            <li><strong>Priority order:</strong> HR data → Compliance → Client info → General knowledge</li>
            <li><strong>Reject criteria:</strong> Outdated (&gt;1 year), unverified sources, contradictions</li>
            <li><strong>Auto-review trust:</strong> Items with <code>auto_reviewed_at</code> need extra scrutiny</li>
            <li><strong>Cross-validation:</strong> Check if similar items exist before approving duplicates</li>
          </ul>
        </div>

        {/* Weekly Goals */}
        <div className="border-t pt-4">
          <h4 className="font-semibold mb-2">🎯 Weekly Validation Goals</h4>
          <div className="grid grid-cols-2 gap-3">
            <Card>
              <CardContent className="pt-3 pb-3">
                <p className="text-2xl font-bold">100</p>
                <p className="text-xs text-muted-foreground">Min. items validated/week</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-3 pb-3">
                <p className="text-2xl font-bold">&gt;90%</p>
                <p className="text-xs text-muted-foreground">Target verified rate</p>
              </CardContent>
            </Card>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
