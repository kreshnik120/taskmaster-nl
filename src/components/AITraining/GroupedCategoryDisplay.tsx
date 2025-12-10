import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, ChevronRight, Briefcase, Users, Scale, TrendingUp, Settings, Building } from "lucide-react";
import { 
  CATEGORY_GROUPS, 
  CATEGORY_LABELS, 
  getCoverageColor, 
  getCoverageBgColor, 
  getCoverageIcon 
} from "@/lib/constants/knowledgeCategoryHierarchy";

interface CategoryStats {
  total: number;
  embedded: number;
  usage: number;
}

interface GroupedCategoryDisplayProps {
  categoryData: Record<string, CategoryStats>;
}

const getGroupIcon = (iconName: string) => {
  switch (iconName) {
    case 'Briefcase': return <Briefcase className="h-5 w-5" />;
    case 'Users': return <Users className="h-5 w-5" />;
    case 'Scale': return <Scale className="h-5 w-5" />;
    case 'TrendingUp': return <TrendingUp className="h-5 w-5" />;
    case 'Settings': return <Settings className="h-5 w-5" />;
    case 'Building': return <Building className="h-5 w-5" />;
    default: return <Settings className="h-5 w-5" />;
  }
};

export const GroupedCategoryDisplay = ({ categoryData }: GroupedCategoryDisplayProps) => {
  const [openGroups, setOpenGroups] = useState<string[]>(CATEGORY_GROUPS.map(g => g.id));

  const toggleGroup = (groupId: string) => {
    setOpenGroups(prev => 
      prev.includes(groupId) 
        ? prev.filter(id => id !== groupId)
        : [...prev, groupId]
    );
  };

  // Calculate group-level stats
  const getGroupStats = (group: typeof CATEGORY_GROUPS[0]) => {
    let totalItems = 0;
    let embeddedItems = 0;
    let totalUsage = 0;
    const categoriesWithData: Array<{ category: string; stats: CategoryStats }> = [];

    group.categories.forEach(cat => {
      const stats = categoryData[cat];
      if (stats) {
        totalItems += stats.total;
        embeddedItems += stats.embedded;
        totalUsage += stats.usage;
        categoriesWithData.push({ category: cat, stats });
      }
    });

    // Sort by usage (highest first)
    categoriesWithData.sort((a, b) => b.stats.usage - a.stats.usage);

    const coverage = totalItems > 0 ? Math.round((embeddedItems / totalItems) * 100) : 0;

    return { totalItems, embeddedItems, totalUsage, coverage, categoriesWithData };
  };

  // Sort groups by total usage
  const sortedGroups = [...CATEGORY_GROUPS]
    .map(group => ({ group, stats: getGroupStats(group) }))
    .filter(g => g.stats.totalItems > 0) // Only show groups with data
    .sort((a, b) => b.stats.totalUsage - a.stats.totalUsage);

  return (
    <div className="space-y-3">
      {sortedGroups.map(({ group, stats }) => (
        <Collapsible
          key={group.id}
          open={openGroups.includes(group.id)}
          onOpenChange={() => toggleGroup(group.id)}
        >
          <Card className={`overflow-hidden ${getCoverageBgColor(stats.coverage)}`}>
            <CollapsibleTrigger className="w-full">
              <div className="p-4 flex items-center justify-between hover:bg-muted/50 transition-colors">
                <div className="flex items-center gap-3">
                  {openGroups.includes(group.id) ? (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  )}
                  <div className={`p-2 rounded-lg ${getCoverageBgColor(stats.coverage)}`}>
                    {getGroupIcon(group.icon)}
                  </div>
                  <div className="text-left">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{group.label}</span>
                      <span>{getCoverageIcon(stats.coverage)}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">{group.description}</p>
                  </div>
                </div>
                
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <p className={`text-lg font-bold ${getCoverageColor(stats.coverage)}`}>
                      {stats.coverage}%
                    </p>
                    <p className="text-xs text-muted-foreground">coverage</p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold">{stats.embeddedItems}</p>
                    <p className="text-xs text-muted-foreground">van {stats.totalItems}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold text-primary">{stats.totalUsage.toLocaleString()}</p>
                    <p className="text-xs text-muted-foreground">gebruikt</p>
                  </div>
                </div>
              </div>
            </CollapsibleTrigger>

            <CollapsibleContent>
              <div className="px-4 pb-4 border-t">
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 mt-3">
                  {stats.categoriesWithData.map(({ category, stats: catStats }) => {
                    const catCoverage = catStats.total > 0 
                      ? Math.round((catStats.embedded / catStats.total) * 100) 
                      : 0;
                    
                    return (
                      <div 
                        key={category}
                        className="p-3 bg-background/80 rounded-lg border"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-medium truncate">
                            {CATEGORY_LABELS[category] || category}
                          </span>
                          <span className="text-xs">{getCoverageIcon(catCoverage)}</span>
                        </div>
                        
                        <Progress 
                          value={catCoverage} 
                          className="h-1.5 mb-2"
                        />
                        
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span>{catStats.embedded}/{catStats.total}</span>
                          <Badge variant="outline" className="text-[10px] px-1 py-0">
                            {catStats.usage}x
                          </Badge>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </CollapsibleContent>
          </Card>
        </Collapsible>
      ))}

      {sortedGroups.length === 0 && (
        <Card className="p-8 text-center text-muted-foreground">
          Geen kenniscategorieën gevonden
        </Card>
      )}
    </div>
  );
};
