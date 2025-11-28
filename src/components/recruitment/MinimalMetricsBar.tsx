interface MinimalMetricsBarProps {
  totalApplications: number;
  newApplications: number;
  approvedApplications: number;
  avgCompleteness: number;
}

export function MinimalMetricsBar({ 
  totalApplications, 
  newApplications, 
  approvedApplications,
  avgCompleteness 
}: MinimalMetricsBarProps) {
  return (
    <div className="grid grid-cols-4 gap-8 py-6 border-b">
      <div className="text-center">
        <div className="text-4xl font-semibold text-foreground mb-1">
          {totalApplications}
        </div>
        <div className="text-sm text-muted-foreground">
          Totaal
        </div>
      </div>
      
      <div className="text-center">
        <div className="text-4xl font-semibold text-blue-600 mb-1">
          {newApplications}
        </div>
        <div className="text-sm text-muted-foreground">
          Nieuw
        </div>
      </div>
      
      <div className="text-center">
        <div className="text-4xl font-semibold text-emerald-600 mb-1">
          {approvedApplications}
        </div>
        <div className="text-sm text-muted-foreground">
          Goedgekeurd
        </div>
      </div>
      
      <div className="text-center">
        <div className="text-4xl font-semibold text-primary mb-1">
          {avgCompleteness}%
        </div>
        <div className="text-sm text-muted-foreground">
          Compleet
        </div>
      </div>
    </div>
  );
}
