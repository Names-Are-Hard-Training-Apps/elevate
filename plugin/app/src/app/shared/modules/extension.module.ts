import { NgModule } from "@angular/core";
import { DataStore } from "../data-store/data-store";
import { ChromeDataStore } from "../data-store/impl/chrome-data-store.service";
import { AppEventsService } from "../services/external-updates/app-events-service";
import { ChromeEventsService } from "../services/external-updates/impl/chrome-events.service";
import { VERSIONS_PROVIDER } from "../services/versions/versions-provider.interface";
import { ChromeVersionsProvider } from "../services/versions/impl/chrome-versions-provider.service";
import { SyncService } from "../services/sync/sync.service";
import { ChromeSyncService } from "../services/sync/impl/chrome-sync.service";

@NgModule({
	providers: [
		{provide: DataStore, useClass: ChromeDataStore},
		{provide: AppEventsService, useClass: ChromeEventsService},
		{provide: SyncService, useClass: ChromeSyncService},
		{provide: VERSIONS_PROVIDER, useClass: ChromeVersionsProvider},
	]
})
export class ExtensionModule {
}