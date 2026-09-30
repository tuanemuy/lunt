import { loadEventsPage } from "@/presentation/exploreData";
import { EventList } from "../EventList";

/** VW-07's body as a server component: the first page, handed to `EventList`. */
export async function EventsContent() {
  return <EventList first={await loadEventsPage(1)} />;
}
