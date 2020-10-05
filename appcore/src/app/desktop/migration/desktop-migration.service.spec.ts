import { TestBed } from "@angular/core/testing";

import { DesktopMigrationService } from "./desktop-migration.service";
import { CoreModule } from "../../core/core.module";
import { SharedModule } from "../../shared/shared.module";
import { DesktopModule } from "../../shared/modules/desktop/desktop.module";
import { DesktopMigration } from "./desktop-migrations";
import { DataStore } from "../../shared/data-store/data-store";
import { TestingDataStore } from "../../shared/data-store/testing-datastore.service";

describe("DesktopMigrationService", () => {
    let service: DesktopMigrationService;
    beforeEach(done => {
        TestBed.configureTestingModule({
            imports: [CoreModule, SharedModule, DesktopModule],
            providers: [{ provide: DataStore, useClass: TestingDataStore }],
        });

        service = TestBed.inject(DesktopMigrationService);
        done();
    });

    it("should detect upgrade", done => {
        // Given
        const packageVersion = "7.1.0";
        const existingVersion = "7.0.0";
        spyOn(service.desktopVersionsProvider, "getPackageVersion").and.returnValue(Promise.resolve(packageVersion));
        spyOn(service.desktopVersionsProvider, "getExistingVersion").and.returnValue(Promise.resolve(existingVersion));

        // When
        const promise = service.detectUpgrade();

        // Then
        promise.then(
            (upgradeData: { fromVersion: string; toVersion: string }) => {
                expect(upgradeData).not.toBeNull();
                expect(upgradeData.fromVersion).toBe(existingVersion);
                expect(upgradeData.toVersion).toBe(packageVersion);
                done();
            },
            () => {
                throw new Error("Should not be here");
            }
        );
    });

    it("should not detect upgrade when existing & package version are same", done => {
        // Given
        const packageVersion = "7.0.0";
        const existingVersion = "7.0.0";
        spyOn(service.desktopVersionsProvider, "getPackageVersion").and.returnValue(Promise.resolve(packageVersion));
        spyOn(service.desktopVersionsProvider, "getExistingVersion").and.returnValue(Promise.resolve(existingVersion));

        // When
        const promise = service.detectUpgrade();

        // Then
        promise.then(
            (upgrade: { fromVersion: string; toVersion: string }) => {
                expect(upgrade).toBeNull();
                done();
            },
            () => {
                throw new Error("Should not be here");
            }
        );
    });

    it("should not detect upgrade when no existing version", done => {
        // Given
        const packageVersion = "7.0.0";
        const existingVersion = "7.0.0";
        spyOn(service.desktopVersionsProvider, "getPackageVersion").and.returnValue(Promise.resolve(packageVersion));
        spyOn(service.desktopVersionsProvider, "getExistingVersion").and.returnValue(Promise.resolve(existingVersion));

        // When
        const promise = service.detectUpgrade();

        // Then
        promise.then(
            (upgradeData: { fromVersion: string; toVersion: string }) => {
                expect(upgradeData).toBeNull();
                done();
            },
            () => {
                throw new Error("Should not be here");
            }
        );
    });

    it("should detect downgrade", done => {
        // Given
        const packageVersion = "6.0.0";
        const existingVersion = "7.0.0";
        const errorMessage = `Downgrade detected from ${existingVersion} to ${packageVersion}. You might encounter some issues. Consider uninstall this version and reinstall latest version to avoid issues.`;
        const expectedError = { reason: "DOWNGRADE", message: errorMessage };
        spyOn(service.desktopVersionsProvider, "getPackageVersion").and.returnValue(Promise.resolve(packageVersion));
        spyOn(service.desktopVersionsProvider, "getExistingVersion").and.returnValue(Promise.resolve(existingVersion));

        // When
        const promise = service.detectUpgrade();

        // Then
        promise.then(
            () => {
                throw new Error("Should not be here");
            },
            err => {
                expect(err).not.toBeNull();
                expect(err).toEqual(expectedError);
                done();
            }
        );
    });

    it("should trigger upgrade", done => {
        // Given
        const packageVersion = "7.1.0";
        const existingVersion = "7.0.0";
        const detectUpgradeSpy = spyOn(service, "detectUpgrade").and.callThrough();
        spyOn(service.desktopVersionsProvider, "getPackageVersion").and.returnValue(Promise.resolve(packageVersion));
        spyOn(service.desktopVersionsProvider, "getExistingVersion").and.returnValue(Promise.resolve(existingVersion));
        const setExistingVersionSpy = spyOn(service.desktopVersionsProvider, "setExistingVersion").and.returnValue(
            Promise.resolve()
        );
        spyOn(service.dataStore, "saveDataStore").and.returnValue(Promise.resolve());

        // When
        const promise = service.upgrade();

        // Then
        promise.then(
            () => {
                expect(detectUpgradeSpy).toHaveBeenCalledTimes(1);
                expect(setExistingVersionSpy).toHaveBeenCalledTimes(1);
                done();
            },
            () => {
                throw new Error("Should not be here");
            }
        );
    });

    it("should track package version from newly migrated version", done => {
        // Given
        const packageVersion = "7.1.0";
        spyOn(service.desktopVersionsProvider, "getPackageVersion").and.returnValue(Promise.resolve(packageVersion));
        const setExistingVersionSpy = spyOn(service.desktopVersionsProvider, "setExistingVersion").and.returnValue(
            Promise.resolve()
        );

        // When
        const promise = service.trackPackageVersion();

        // Then
        promise.then(
            () => {
                expect(setExistingVersionSpy).toHaveBeenCalledWith(packageVersion);
                done();
            },
            () => {
                throw new Error("Should not be here");
            }
        );
    });

    it("should apply upgrades", done => {
        // Given
        const packageVersion = "7.2.0";
        const existingVersion = "7.0.0";
        const fakeColName = "fakeCollection";
        service.dataStore.db.addCollection(fakeColName);

        class FakeMigration01 extends DesktopMigration {
            public version = "7.1.0";

            public description = "Fake migration to " + this.version;

            public upgrade(db: LokiConstructor): Promise<void> {
                db.getCollection(fakeColName).insert({ name: "John Doe" });
                return Promise.resolve();
            }
        }

        class FakeMigration02 extends DesktopMigration {
            public version = "7.2.0";

            public description = "Fake migration to " + this.version;

            public upgrade(db: LokiConstructor): Promise<void> {
                db.getCollection(fakeColName).insert({ name: "Jane Doe" });
                return Promise.resolve();
            }
        }

        const fakeMigration01 = new FakeMigration01();
        const fakeMigration02 = new FakeMigration02();

        const fakeMigration01Spy = spyOn(fakeMigration01, "upgrade").and.callThrough();
        const fakeMigration02Spy = spyOn(fakeMigration02, "upgrade").and.callThrough();

        const DESKTOP_MIGRATIONS: DesktopMigration[] = [fakeMigration01, fakeMigration02];

        spyOn(service, "getMigrations").and.returnValue(DESKTOP_MIGRATIONS);

        // When
        const promise = service.applyUpgrades(existingVersion, packageVersion);

        // Then
        promise.then(
            () => {
                expect(fakeMigration01Spy).toHaveBeenCalledTimes(1);
                expect(fakeMigration02Spy).toHaveBeenCalledTimes(1);

                const collection = service.dataStore.db.getCollection(fakeColName);
                expect(collection.count()).toEqual(2);
                done();
            },
            () => {
                throw new Error("Should not be here");
            }
        );
    });
});