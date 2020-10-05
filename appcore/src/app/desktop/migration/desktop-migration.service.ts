import { Inject, Injectable } from "@angular/core";
import { VERSIONS_PROVIDER } from "../../shared/services/versions/versions-provider.interface";
import * as semver from "semver";
import { DesktopVersionsProvider } from "../../shared/services/versions/impl/desktop-versions-provider.service";
import { LoggerService } from "../../shared/services/logging/logger.service";
import { MatDialog } from "@angular/material/dialog";
import { GotItDialogComponent } from "../../shared/dialogs/got-it-dialog/got-it-dialog.component";
import { GotItDialogDataModel } from "../../shared/dialogs/got-it-dialog/got-it-dialog-data.model";
import { DataStore } from "../../shared/data-store/data-store";
import { DESKTOP_MIGRATIONS, DesktopMigration } from "./desktop-migrations";

@Injectable()
export class DesktopMigrationService {
    private readonly db: LokiConstructor;

    constructor(
        @Inject(VERSIONS_PROVIDER) public readonly desktopVersionsProvider: DesktopVersionsProvider,
        public readonly dataStore: DataStore<object>,
        public readonly dialog: MatDialog,
        public readonly logger: LoggerService
    ) {
        this.db = this.dataStore.db;
    }

    /**
     * Perform required upgrades to a newly version installed.
     * Do nothing if no new versions.
     */
    public upgrade(): Promise<void> {
        return this.detectUpgrade()
            .then((upgradeData: { fromVersion: string; toVersion: string }) => {
                if (upgradeData) {
                    return this.applyUpgrades(upgradeData.fromVersion, upgradeData.toVersion).then(() => {
                        return this.dataStore.saveDataStore();
                    });
                } else {
                    this.logger.info("No upgrade detected");
                }
                return Promise.resolve();
            })
            .then(() => {
                return this.trackPackageVersion();
            })
            .catch(err => {
                if (err.reason && err.reason === "DOWNGRADE") {
                    this.dialog.open(GotItDialogComponent, {
                        data: {
                            content: err.message,
                        } as GotItDialogDataModel,
                    });
                    return this.trackPackageVersion();
                }
                return Promise.reject(err);
            });
    }

    public detectUpgrade(): Promise<{ fromVersion: string; toVersion: string }> {
        return Promise.all([
            this.desktopVersionsProvider.getExistingVersion(),
            this.desktopVersionsProvider.getPackageVersion(),
        ]).then((results: string[]) => {
            const existingVersion = results[0];
            const packageVersion = results[1];

            if (!existingVersion) {
                this.logger.info(`First install detected.`);
                return Promise.resolve(null);
            }

            if (semver.eq(existingVersion, packageVersion)) {
                return Promise.resolve(null);
            }

            if (semver.eq(existingVersion, packageVersion)) {
                return Promise.resolve({ fromVersion: existingVersion, toVersion: packageVersion });
            }

            if (semver.lt(existingVersion, packageVersion)) {
                return Promise.resolve({ fromVersion: existingVersion, toVersion: packageVersion });
            }

            if (semver.gt(existingVersion, packageVersion)) {
                const errorMessage = `Downgrade detected from ${existingVersion} to ${packageVersion}. You might encounter some issues. Consider uninstall this version and reinstall latest version to avoid issues.`;
                return Promise.reject({ reason: "DOWNGRADE", message: errorMessage });
            }

            return Promise.reject(
                `Upgrade detection error with existing version: ${existingVersion}; packageVersion: ${packageVersion}`
            );
        });
    }

    /**
     * Stores the package version into local storage to detect any upgrades with upper versions.
     */
    public trackPackageVersion(): Promise<void> {
        return this.desktopVersionsProvider.getPackageVersion().then(packageVersion => {
            return this.desktopVersionsProvider.setExistingVersion(packageVersion);
        });
    }

    public applyUpgrades(fromVersion: string, toVersion: string): Promise<void> {
        this.logger.info(`Applying upgrade(s) from ${fromVersion} to ${toVersion}`);

        return this.getMigrations().reduce((previousMigrationDone: Promise<void>, migration: DesktopMigration) => {
            return previousMigrationDone.then(() => {
                if (semver.lt(fromVersion, migration.version)) {
                    this.logger.info(`Migrating to ${migration.version}: ${migration.description}`);
                    return migration.upgrade(this.db);
                }

                return Promise.resolve();
            });
        }, Promise.resolve());
    }

    public getMigrations(): DesktopMigration[] {
        return DESKTOP_MIGRATIONS;
    }
}
