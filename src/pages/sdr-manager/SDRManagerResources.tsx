import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageContainer } from "@/components/layout/PageContainer";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ExternalLink, FileText } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";

// Map display names to database values
const CATEGORY_MAP: Record<string, string> = {
  "Video Resources": "video",
  "Templates": "template",
  "Testimonials": "testimonial",
  "Processes": "process"
};

const DISPLAY_CATEGORIES = ["Video Resources", "Templates", "Testimonials", "Processes"];

const SDRManagerResources = () => {
  const [resources, setResources] = useState<any[]>([]);

  useEffect(() => {
    loadResources();
  }, []);

  const loadResources = async () => {
    const { data } = await supabase.from("resources").select("*").order("created_at", { ascending: false });
    if (data) setResources(data);
  };

  return (
    <DashboardLayout role="admin">
      <PageContainer>
        <PageHeader 
          title="Resources" 
          subtitle="Training materials and helpful resources"
        />
        <div className="space-y-5">
          <Tabs defaultValue="Video Resources" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            {DISPLAY_CATEGORIES.map((cat) => (
              <TabsTrigger key={cat} value={cat}>
                {cat}
              </TabsTrigger>
            ))}
          </TabsList>
          {DISPLAY_CATEGORIES.map((displayCategory) => (
            <TabsContent key={displayCategory} value={displayCategory} className="space-y-4">
              {resources
                .filter((r) => r.category === CATEGORY_MAP[displayCategory])
                .map((resource) => (
                  <Card key={resource.id}>
                    <CardHeader>
                      <CardTitle className="flex items-center justify-between">
                        <span>{resource.title}</span>
                        <a
                          href={resource.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:text-primary/80"
                        >
                          <ExternalLink className="h-5 w-5" />
                        </a>
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-muted-foreground">{resource.description}</p>
                    </CardContent>
                  </Card>
                ))}
              {resources.filter((r) => r.category === CATEGORY_MAP[displayCategory]).length === 0 && (
                <EmptyState 
                  icon={FileText}
                  title="No resources available"
                  description="No resources available in this category yet."
                />
              )}
            </TabsContent>
          ))}
          </Tabs>
        </div>
      </PageContainer>
    </DashboardLayout>
  );
};

export default SDRManagerResources;
