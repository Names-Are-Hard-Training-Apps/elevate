import { TestBed } from "@angular/core/testing";

import { DesktopDataStore } from "./desktop-data-store.service";
import { StorageLocationModel } from "../storage-location.model";
import * as _ from "lodash";
import { LoggerService } from "../../services/logging/logger.service";
import { ConsoleLoggerService } from "../../services/logging/console-logger.service";
import { StorageType } from "../storage-type.enum";
import { VERSIONS_PROVIDER } from "../../services/versions/versions-provider.interface";
import { MockedVersionsProvider } from "../../services/versions/impl/mock/mocked-versions-provider";
import { Gzip } from "@elevate/shared/tools/gzip";
import { DesktopDumpModel } from "../../models/dumps/desktop-dump.model";
import PouchDB from "pouchdb-browser";
import { ElevateSport } from "@elevate/shared/enums";
import Spy = jasmine.Spy;

describe("DesktopDataStore", () => {

    class FakeDoc {
        _id?: string;
        $doctype?: string;

        constructor(id: string) {
            this._id = id;
            this.$doctype = id;
        }
    }

    class FakeSettings {

        maxHr: number;
        restHr: number;
        weight: number;

        constructor(maxHr: number, restHr: number, weight: number) {
            this.maxHr = maxHr;
            this.restHr = restHr;
            this.weight = weight;
        }
    }

    class FakeAthlete extends FakeDoc {

        name: string;
        age: number;
        fakeSettings: FakeSettings[];

        constructor(name: string, age: number, fakeSettings: FakeSettings[]) {
            super("fakeAthlete");
            this.name = name;
            this.age = age;
            this.fakeSettings = fakeSettings;
        }
    }

    class FakeDateTime extends FakeDoc {

        $value: any;

        constructor($value: any) {
            super("fakeDateTime");
            this.$value = $value;
        }
    }

    class FakeActivity extends FakeDoc {

        activityId: string;
        name: string;
        type: string;
        start_time: string;
        end_time: string;
        duration: number;

        constructor(activityId: string, name: string, type: string, start_time: string, duration: number) {
            super("fakeSyncedActivity:" + activityId);
            this.$doctype = "fakeSyncedActivity"; // Override to ensure doctype
            this.activityId = activityId;
            this.name = name;
            this.type = type;
            this.start_time = start_time;
            this.duration = duration;

            const endDate = new Date(start_time);
            endDate.setSeconds(endDate.getSeconds() + this.duration);
            this.end_time = endDate.toISOString();
        }
    }

    let desktopDataStore: DesktopDataStore<any[] | any>;
    let testDatabase: PouchDB.Database<any[] | any>;

    const FAKE_EXISTING_DOCUMENTS: FakeDoc[] = [
        new FakeAthlete("Thomas", 32, [new FakeSettings(189, 60, 75),
            new FakeSettings(195, 50, 72)]),

        new FakeDateTime(new Date().getTime()),

        new FakeActivity("00001", "Zwift climb", ElevateSport.Ride, "2019-03-12T16:00:00Z", 3600),
        new FakeActivity("00002", "Recover session", ElevateSport.Ride, "2019-03-17T16:39:48Z", 3600),
        new FakeActivity("00003", "Easy running day!", ElevateSport.Run, "2019-05-01T16:39:48Z", 3600),
    ];

    const FAKE_ATHLETE_STORAGE_LOCATION = new StorageLocationModel("fakeAthlete", StorageType.OBJECT);
    const FAKE_ACTIVITIES_STORAGE_LOCATION = new StorageLocationModel("fakeSyncedActivity", StorageType.COLLECTION, "activityId");
    const FAKE_DATE_TIME_STORAGE_LOCATION = new StorageLocationModel("fakeDateTime", StorageType.SINGLE_VALUE);

    let provideDatabaseSpy;

    const resetTestDatabase = () => {
        testDatabase = new PouchDB(DesktopDataStore.POUCH_DB_PREFIX + "test", {auto_compaction: true});
        provideDatabaseSpy.and.returnValue(testDatabase);
    };

    beforeEach(done => {

        const mockedVersionsProvider: MockedVersionsProvider = new MockedVersionsProvider();

        TestBed.configureTestingModule({
            providers: [
                DesktopDataStore,
                {provide: LoggerService, useClass: ConsoleLoggerService},
                {provide: VERSIONS_PROVIDER, useValue: mockedVersionsProvider}
            ]
        });

        const fakeDocs = _.cloneDeep(FAKE_EXISTING_DOCUMENTS);

        desktopDataStore = TestBed.inject(DesktopDataStore);
        provideDatabaseSpy = spyOn(desktopDataStore, "provideDatabase");
        resetTestDatabase();

        testDatabase.allDocs().then(results => {
            expect(results.total_rows).toEqual(0);
            return testDatabase.bulkDocs(fakeDocs);

        }).then(results => {
            expect(results.length).toEqual(fakeDocs.length);
            done();

        }).catch(error => {
            console.error(error);
            throw error;
        });
    });

    afterEach(done => {

        // Cleaning database
        testDatabase.destroy().then(() => {
            done();
        }).catch(error => {
            console.error(error);
            throw error;
        });
    });

    describe("Handle object", () => {

        it("should fetch a FakeAthlete object", done => {

            // Given
            const expectedFakeAthlete: FakeAthlete = <FakeAthlete> _.find(FAKE_EXISTING_DOCUMENTS, {_id: "fakeAthlete"});

            // When
            const promise: Promise<FakeAthlete> = <Promise<FakeAthlete>> desktopDataStore.fetch(FAKE_ATHLETE_STORAGE_LOCATION, null);

            // Then
            promise.then((fakeAthlete: FakeAthlete) => {

                expect(fakeAthlete._id).toEqual(expectedFakeAthlete._id);
                expect(fakeAthlete.name).toEqual(expectedFakeAthlete.name);
                expect(fakeAthlete.age).toEqual(expectedFakeAthlete.age);
                expect(fakeAthlete.fakeSettings.length).toEqual(expectedFakeAthlete.fakeSettings.length);
                expect(fakeAthlete.$doctype).toEqual(expectedFakeAthlete.$doctype);

                done();

            }, error => {
                expect(error).toBeNull();
                expect(false).toBeTruthy("Whoops! I should not be here!");
                done();
            });
        });

        it("should fetch default storage value when FakeAthlete object is missing in database", done => {

            // Given
            const defaultFakeAthlete: FakeAthlete = new FakeAthlete("Your Name", 30, []);

            const promiseMissing = testDatabase.get(FAKE_ATHLETE_STORAGE_LOCATION.key).then(fakeAthlete => {
                return testDatabase.remove(fakeAthlete);
            });

            // When
            const promise: Promise<FakeAthlete> = <Promise<FakeAthlete>> promiseMissing.then(() => {
                return desktopDataStore.fetch(FAKE_ATHLETE_STORAGE_LOCATION, defaultFakeAthlete);
            });

            // Then
            promise.then((fakeAthlete: FakeAthlete) => {

                expect(fakeAthlete._id).toEqual(defaultFakeAthlete._id);
                expect(fakeAthlete.name).toEqual(defaultFakeAthlete.name);
                expect(fakeAthlete.age).toEqual(defaultFakeAthlete.age);
                expect(fakeAthlete.fakeSettings.length).toEqual(defaultFakeAthlete.fakeSettings.length);

                done();

            }, error => {
                expect(error).toBeNull();
                expect(false).toBeTruthy("Whoops! I should not be here!");
                done();
            });
        });

        it("should get by id a FakeAthlete object", done => {

            // Given
            const id = "fakeAthlete";
            const expectedFakeAthlete: FakeAthlete = <FakeAthlete> _.find(FAKE_EXISTING_DOCUMENTS, {_id: id});

            // When
            const promise: Promise<FakeAthlete> = <Promise<FakeAthlete>> desktopDataStore.getById(FAKE_ATHLETE_STORAGE_LOCATION, id);

            // Then
            promise.then((fakeAthlete: FakeAthlete) => {

                expect(fakeAthlete._id).toEqual(expectedFakeAthlete._id);
                expect(fakeAthlete.name).toEqual(expectedFakeAthlete.name);
                expect(fakeAthlete.age).toEqual(expectedFakeAthlete.age);
                expect(fakeAthlete.fakeSettings.length).toEqual(expectedFakeAthlete.fakeSettings.length);
                expect(fakeAthlete.$doctype).toEqual(expectedFakeAthlete.$doctype);

                done();

            }, error => {
                expect(error).toBeNull();
                expect(false).toBeTruthy("Whoops! I should not be here!");
                done();
            });
        });

        it("should save and replace a FakeAthlete object", done => {

            // Given
            const newFakeAthlete: FakeAthlete = <FakeAthlete> _.cloneDeep(_.find(FAKE_EXISTING_DOCUMENTS, {_id: "fakeAthlete"}));
            newFakeAthlete.age = 99;
            newFakeAthlete.name = "Fake name";
            newFakeAthlete.fakeSettings = [new FakeSettings(99, 99, 99)];

            // When
            const promise: Promise<FakeAthlete> = <Promise<FakeAthlete>> desktopDataStore.save(FAKE_ATHLETE_STORAGE_LOCATION, newFakeAthlete, null);

            // Then
            promise.then((savedFakeAthlete: FakeAthlete) => {

                expect(savedFakeAthlete._id).toEqual(newFakeAthlete._id);
                expect(savedFakeAthlete.name).toEqual(newFakeAthlete.name);
                expect(savedFakeAthlete.age).toEqual(newFakeAthlete.age);
                expect(savedFakeAthlete.fakeSettings.length).toEqual(newFakeAthlete.fakeSettings.length);
                expect(savedFakeAthlete.$doctype).toEqual(newFakeAthlete.$doctype);

                done();

            }, error => {
                expect(error).toBeNull();
                expect(false).toBeTruthy("Whoops! I should not be here!");
                done();
            });

        });

        it("should save a FakeAthlete when object is missing in database", done => {

            // Given
            const expectedDocType = "fakeAthlete";
            const defaultFakeAthlete: FakeAthlete = {
                name: "Your Name",
                age: 30,
                fakeSettings: [new FakeSettings(11, 11, 11)]
            };

            const newFakeAthlete: FakeAthlete = {
                name: "Fake name",
                age: 99,
                fakeSettings: [new FakeSettings(99, 99, 99)]
            };

            const promiseMissing = testDatabase.get(FAKE_ATHLETE_STORAGE_LOCATION.key).then(fakeAthlete => {
                return testDatabase.remove(fakeAthlete);
            });

            // When
            const promise: Promise<FakeAthlete> = promiseMissing.then(() => {
                return <Promise<FakeAthlete>> desktopDataStore.save(FAKE_ATHLETE_STORAGE_LOCATION, newFakeAthlete, defaultFakeAthlete);
            });

            // Then
            promise.then((savedFakeAthlete: FakeAthlete) => {

                expect(savedFakeAthlete._id).toEqual(newFakeAthlete._id);
                expect(savedFakeAthlete.name).toEqual(newFakeAthlete.name);
                expect(savedFakeAthlete.age).toEqual(newFakeAthlete.age);
                expect(savedFakeAthlete.fakeSettings.length).toEqual(newFakeAthlete.fakeSettings.length);
                expect(savedFakeAthlete.$doctype).toEqual(expectedDocType);

                done();

            }, error => {
                expect(error).toBeNull();
                expect(false).toBeTruthy("Whoops! I should not be here!");
                done();
            });

        });

        it("should put (create) a FakeAthlete as object", done => {

            // Given
            const expectedDocId = "fakeAthlete";
            const docType = "fakeAthlete";
            const newFakeAthlete: FakeAthlete = {name: "Jean kevin", age: 30, fakeSettings: []};

            const promiseMissing = testDatabase.get(FAKE_ATHLETE_STORAGE_LOCATION.key).then(fakeAthlete => {
                return testDatabase.remove(fakeAthlete);
            });

            // When
            const promise: Promise<FakeAthlete> = promiseMissing.then(() => {
                return <Promise<FakeAthlete>> desktopDataStore.put(FAKE_ATHLETE_STORAGE_LOCATION, newFakeAthlete);
            });

            // Then
            promise.then((fakeAthlete: FakeAthlete) => {

                expect(fakeAthlete._id).toEqual(expectedDocId);
                expect(fakeAthlete.name).toEqual(newFakeAthlete.name);
                expect(fakeAthlete.age).toEqual(newFakeAthlete.age);
                expect(fakeAthlete.fakeSettings).toEqual(newFakeAthlete.fakeSettings);
                expect(fakeAthlete.$doctype).toEqual(docType);

                done();

            }, error => {
                expect(error).toBeNull();
                expect(false).toBeTruthy("Whoops! I should not be here!");
                done();
            });
        });

        it("should put (update) a FakeAthlete as object", done => {

            // Given
            const docId = "fakeAthlete";
            const docType = "fakeAthlete";
            const updatedFakeAthlete: FakeAthlete = {_id: docId, name: "Jean kevin", age: 30, fakeSettings: [], $doctype: docType};

            const promiseSetRevision = testDatabase.get(docId).then(doc => {
                updatedFakeAthlete[DesktopDataStore.POUCH_DB_REV_FIELD] = doc._rev;
                return Promise.resolve();
            });

            // When
            const promise: Promise<FakeAthlete> = promiseSetRevision.then(() => {
                return desktopDataStore.put(FAKE_ATHLETE_STORAGE_LOCATION, updatedFakeAthlete);
            });

            // Then
            promise.then((fakeAthlete: FakeAthlete) => {

                expect(fakeAthlete._id).toEqual(docId);
                expect(fakeAthlete.name).toEqual(updatedFakeAthlete.name);
                expect(fakeAthlete.age).toEqual(updatedFakeAthlete.age);
                expect(fakeAthlete.fakeSettings).toEqual(updatedFakeAthlete.fakeSettings);
                expect(fakeAthlete.$doctype).toEqual(docType);

                done();

            }, error => {
                expect(error).toBeNull();
                expect(false).toBeTruthy("Whoops! I should not be here!");
                done();
            });
        });

        it("should upsert property of a FakeAthlete object", done => {

            // Given
            const newValue = 666;
            const updatePath = ["fakeSettings", "1", "weight"]; // eq "fakeSettings[1].weight"

            const expectedFakeAthlete: FakeAthlete = <FakeAthlete> _.find(FAKE_EXISTING_DOCUMENTS, {_id: "fakeAthlete"});
            expectedFakeAthlete.fakeSettings[1].weight = newValue;

            // When
            const promise: Promise<FakeAthlete> = <Promise<FakeAthlete>> desktopDataStore.putAt(FAKE_ATHLETE_STORAGE_LOCATION,
                updatePath, newValue, null);

            // Then
            promise.then((savedFakeAthlete: FakeAthlete) => {

                expect(savedFakeAthlete._id).toEqual(expectedFakeAthlete._id);
                expect(savedFakeAthlete.name).toEqual(expectedFakeAthlete.name);
                expect(savedFakeAthlete.age).toEqual(expectedFakeAthlete.age);
                expect(savedFakeAthlete.fakeSettings.length).toEqual(expectedFakeAthlete.fakeSettings.length);
                expect(savedFakeAthlete.fakeSettings[1].weight).toEqual(expectedFakeAthlete.fakeSettings[1].weight);
                expect(savedFakeAthlete.$doctype).toEqual(expectedFakeAthlete.$doctype);

                done();

            }, error => {
                expect(error).toBeNull();
                expect(false).toBeTruthy("Whoops! I should not be here!");
                done();
            });

        });

        it("should clear FakeAthlete object", done => {

            // When
            const promise: Promise<void> = desktopDataStore.clear(FAKE_ATHLETE_STORAGE_LOCATION);

            // Then
            promise.then(() => {

                testDatabase.find({
                    selector: {
                        _id: {$eq: FAKE_ATHLETE_STORAGE_LOCATION.key}
                    }
                }).then(results => {
                    expect(results.docs.length).toEqual(0);
                    done();
                });

            }, error => {
                expect(error).toBeNull();
                expect(false).toBeTruthy("Whoops! I should not be here!");
                done();
            });
        });

    });

    describe("Handle collection", () => {

        it("should fetch a FakeActivity collection", done => {

            // Given
            const expectedDocType = "fakeSyncedActivity";
            const expectedFakeActivities: FakeActivity[] = <FakeActivity[]> _.filter(FAKE_EXISTING_DOCUMENTS, (doc: FakeDoc) => {
                return doc._id.match("fakeSyncedActivity:") !== null;
            });

            // When
            const promise: Promise<FakeActivity[]> = <Promise<FakeActivity[]>> desktopDataStore.fetch(FAKE_ACTIVITIES_STORAGE_LOCATION, null);

            // Then
            promise.then((fakeActivities: FakeActivity[]) => {

                expect(fakeActivities.length).toEqual(3);
                expect(fakeActivities[0]._id).toEqual(expectedFakeActivities[0]._id);
                expect(fakeActivities[0].name).toEqual(expectedFakeActivities[0].name);
                expect(fakeActivities[0].type).toEqual(expectedFakeActivities[0].type);
                expect(fakeActivities[0].$doctype).toEqual(expectedDocType);

                expect(fakeActivities[1]._id).toEqual(expectedFakeActivities[1]._id);
                expect(fakeActivities[1].name).toEqual(expectedFakeActivities[1].name);
                expect(fakeActivities[1].type).toEqual(expectedFakeActivities[1].type);
                expect(fakeActivities[1].$doctype).toEqual(expectedDocType);

                expect(fakeActivities[2]._id).toEqual(expectedFakeActivities[2]._id);
                expect(fakeActivities[2].name).toEqual(expectedFakeActivities[2].name);
                expect(fakeActivities[2].type).toEqual(expectedFakeActivities[2].type);
                expect(fakeActivities[2].$doctype).toEqual(expectedDocType);

                done();

            }, error => {
                expect(error).toBeNull();
                expect(false).toBeTruthy("Whoops! I should not be here!");
                done();
            });
        });

        it("should count FakeActivities in collection", done => {

            // Given
            const expectedCount = 3;

            // When
            const promise: Promise<number> = desktopDataStore.count(FAKE_ACTIVITIES_STORAGE_LOCATION);

            // Then
            promise.then((count: number) => {

                expect(count).toEqual(expectedCount);
                done();

            }, error => {
                expect(error).toBeNull();
                expect(false).toBeTruthy("Whoops! I should not be here!");
                done();
            });
        });

        describe("Find in collection", () => {

            it("should find FakeActivity 'Ride' collection", done => {

                // Given
                const expectedType = ElevateSport.Ride;
                const query: PouchDB.Find.FindRequest<FakeActivity[]> = {
                    selector: {
                        type: {
                            $eq: expectedType
                        }
                    }
                };

                const promise: Promise<FakeActivity[]> = <Promise<FakeActivity[]>> desktopDataStore.fetch(FAKE_ACTIVITIES_STORAGE_LOCATION,
                    null, query);

                // Then
                promise.then((fakeActivities: FakeActivity[]) => {

                    expect(fakeActivities.length).toEqual(2);
                    expect(fakeActivities[0].type).toEqual(expectedType);
                    expect(fakeActivities[1].type).toEqual(expectedType);

                    done();

                }, error => {
                    expect(error).toBeNull();
                    expect(false).toBeTruthy("Whoops! I should not be here!");
                    done();
                });
            });

            it("should find FakeActivity between start & end time", done => {

                // Given
                const expectedId = "00001";
                const activityStartTime = "2019-03-12T15:00:00Z";
                const activityEndTime = "2019-03-12T17:00:00Z";

                const query: PouchDB.Find.FindRequest<FakeActivity[]> = {
                    selector: {
                        start_time: {
                            $gte: activityStartTime,
                        },
                        end_time: {
                            $lte: activityEndTime,
                        }
                    }
                };

                const promise: Promise<FakeActivity[]> = <Promise<FakeActivity[]>> desktopDataStore.fetch(FAKE_ACTIVITIES_STORAGE_LOCATION,
                    null, query);

                // Then
                promise.then((fakeActivities: FakeActivity[]) => {

                    expect(fakeActivities.length).toEqual(1);
                    expect(fakeActivities[0].activityId).toEqual(expectedId);

                    done();

                }, error => {
                    expect(error).toBeNull();
                    expect(false).toBeTruthy("Whoops! I should not be here!");
                    done();
                });
            });

        });

        it("should fetch default storage value when FakeActivity collection is missing in database", done => {

            // Given
            const defaultStorageValue = [];
            const promiseMissingCollection = testDatabase.destroy().then(() => { // Clean database and only enter 1 row (a fake athlete)
                const fakeAthlete = _.cloneDeep(_.find(FAKE_EXISTING_DOCUMENTS, {_id: "fakeAthlete"}));
                resetTestDatabase();
                testDatabase.put(fakeAthlete).then(() => {
                    return Promise.resolve();
                });
            });

            // When
            const promise: Promise<FakeActivity[]> = promiseMissingCollection.then(() => {
                return <Promise<FakeActivity[]>> desktopDataStore.fetch(FAKE_ACTIVITIES_STORAGE_LOCATION, defaultStorageValue);
            });

            // Then
            promise.then((fakeActivities: FakeActivity[]) => {

                expect(fakeActivities).toEqual(defaultStorageValue);

                done();

            }, error => {
                expect(error).toBeNull();
                expect(false).toBeTruthy("Whoops! I should not be here!");
                done();
            });
        });

        it("should get by id a FakeActivity into a collection", done => {

            // Given
            const id = "00002";
            const key = "fakeSyncedActivity";
            const expectedDocType = key;
            const expectedFakeActivity: FakeActivity = <FakeActivity> _.find(FAKE_EXISTING_DOCUMENTS, {_id: key + ":" + id});

            // When
            const promise: Promise<FakeActivity> = desktopDataStore.getById(FAKE_ACTIVITIES_STORAGE_LOCATION, id);

            // Then
            promise.then((fakeActivity: FakeActivity) => {

                expect(fakeActivity._id).toEqual(expectedFakeActivity._id);
                expect(fakeActivity.name).toEqual(expectedFakeActivity.name);
                expect(fakeActivity.type).toEqual(expectedFakeActivity.type);
                expect(fakeActivity.$doctype).toEqual(expectedDocType);

                done();

            }, error => {
                expect(error).toBeNull();
                expect(false).toBeTruthy("Whoops! I should not be here!");
                done();
            });
        });

        it("should put (create) a FakeActivity into collection", done => {

            // Given
            const expectedDocType = "fakeSyncedActivity";
            const id = "00009";
            const expectedDocId = "fakeSyncedActivity:" + id;
            const newFakeActivity: FakeActivity = {
                activityId: id,
                name: "New activity !",
                type: ElevateSport.Ride,
                start_time: "2019-03-12T16:39:48Z",
                end_time: "2019-03-12T16:39:48Z",
                duration: 3600,
            };

            // When
            const promise: Promise<FakeActivity> = desktopDataStore.put(FAKE_ACTIVITIES_STORAGE_LOCATION, newFakeActivity);

            // Then
            promise.then((fakeActivity: FakeActivity) => {

                expect(fakeActivity._id).toEqual(expectedDocId);
                expect(fakeActivity.name).toEqual(newFakeActivity.name);
                expect(fakeActivity.activityId).toEqual(newFakeActivity.activityId);
                expect(fakeActivity.type).toEqual(newFakeActivity.type);
                expect(fakeActivity.$doctype).toEqual(expectedDocType);

                done();

            }, error => {
                expect(error).toBeNull();
                expect(false).toBeTruthy("Whoops! I should not be here!");
                done();
            });
        });

        it("should put (update) a FakeActivity into collection", done => {

            // Given
            const docType = "fakeSyncedActivity";
            const id = "00001";
            const docId = "fakeSyncedActivity:" + id;
            const updatedFakeActivity: FakeActivity = {
                _id: docId,
                activityId: id,
                name: "Updated activity !",
                type: ElevateSport.Run,
                start_time: "2019-03-12T16:39:48Z",
                duration: 3600,
                end_time: "2019-03-12T16:39:48Z",
                $doctype: docType
            };

            const putSpy = spyOn(testDatabase, "put").and.callThrough();

            const promiseSetRevision = testDatabase.get(docId).then(doc => {
                updatedFakeActivity[DesktopDataStore.POUCH_DB_REV_FIELD] = doc._rev;
                return Promise.resolve();
            });

            // When
            const promise: Promise<FakeActivity> = promiseSetRevision.then(() => {
                return desktopDataStore.put(FAKE_ACTIVITIES_STORAGE_LOCATION, updatedFakeActivity);
            });

            // Then
            promise.then((fakeActivity: FakeActivity) => {

                expect(fakeActivity._id).toEqual(docId);
                expect(fakeActivity.name).toEqual(updatedFakeActivity.name);
                expect(fakeActivity.activityId).toEqual(updatedFakeActivity.activityId);
                expect(fakeActivity.type).toEqual(updatedFakeActivity.type);
                expect(fakeActivity.$doctype).toEqual(docType);
                expect(putSpy).toHaveBeenCalledWith(updatedFakeActivity);

                done();

            }, error => {
                expect(error).toBeNull();
                expect(false).toBeTruthy("Whoops! I should not be here!");
                done();
            });
        });

        it("should save and replace an existing FakeActivity collection", done => {

            // Given
            const expectedLength = 3;
            const newFakeActivities: FakeActivity[] = [
                {
                    activityId: "00003",
                    name: "Running day! (rename)",
                    type: ElevateSport.Run,
                    start_time: "2019-03-12T16:39:48Z",
                    end_time: "2019-03-12T16:39:48Z",
                    duration: 3600,
                },
                {
                    activityId: "00004",
                    name: "Recovery spins",
                    type: ElevateSport.Ride,
                    start_time: "2019-03-12T16:39:48Z",
                    end_time: "2019-03-12T16:39:48Z",
                    duration: 3600,
                },
                {
                    activityId: "00005",
                    name: "Marathon",
                    type: ElevateSport.Run,
                    start_time: "2019-03-12T16:39:48Z",
                    end_time: "2019-03-12T16:39:48Z",
                    duration: 3600,
                },
            ];

            const expectedExistRenamedActivity = <FakeActivity> _.find(_.cloneDeep(newFakeActivities), activity => {
                return activity.activityId === "00003";
            });
            expectedExistRenamedActivity._id = "fakeSyncedActivity:00003";
            expectedExistRenamedActivity.$doctype = "fakeSyncedActivity";

            const expectedExistActivity = <FakeActivity> _.find(_.cloneDeep(newFakeActivities), activity => {
                return activity.activityId === "00004";
            });
            expectedExistActivity._id = "fakeSyncedActivity:00004";
            expectedExistActivity.$doctype = "fakeSyncedActivity";

            const expectedExistActivity2 = <FakeActivity> _.find(_.cloneDeep(newFakeActivities), activity => {
                return activity.activityId === "00005";
            });
            expectedExistActivity2._id = "fakeSyncedActivity:00005";
            expectedExistActivity2.$doctype = "fakeSyncedActivity";


            // When
            const promise: Promise<FakeActivity[]> = <Promise<FakeActivity[]>> desktopDataStore.save(FAKE_ACTIVITIES_STORAGE_LOCATION,
                newFakeActivities, []);

            // Then
            promise.then((results: FakeActivity[]) => {

                expect(results).not.toBeNull();

                // Test new person added
                const addedFakeActivity_1: FakeActivity = _.find(results, {_id: "fakeSyncedActivity:00004"});
                expect(addedFakeActivity_1._id).toEqual(expectedExistActivity._id);
                expect(addedFakeActivity_1.name).toEqual(expectedExistActivity.name);
                expect(addedFakeActivity_1.type).toEqual(expectedExistActivity.type);
                expect(addedFakeActivity_1.$doctype).toEqual(expectedExistActivity.$doctype);

                const fakeRenamedActivity: FakeActivity = _.find(results, {_id: "fakeSyncedActivity:00003"});
                expect(fakeRenamedActivity._id).toEqual(expectedExistRenamedActivity._id);
                expect(fakeRenamedActivity.name).toEqual(expectedExistRenamedActivity.name);
                expect(fakeRenamedActivity.type).toEqual(expectedExistRenamedActivity.type);
                expect(fakeRenamedActivity.$doctype).toEqual(expectedExistRenamedActivity.$doctype);

                // Test person removed
                const unknownActivity = _.find(results, {_id: "fakeSyncedActivity:00001"});
                expect(unknownActivity).toBeUndefined();

                const addedFakeActivity_2: FakeActivity = _.find(results, {_id: "fakeSyncedActivity:00005"});
                expect(addedFakeActivity_2._id).toEqual(expectedExistActivity2._id);
                expect(addedFakeActivity_2.name).toEqual(expectedExistActivity2.name);
                expect(addedFakeActivity_2.type).toEqual(expectedExistActivity2.type);
                expect(addedFakeActivity_2.$doctype).toEqual(expectedExistActivity2.$doctype);

                expect(results.length).toEqual(expectedLength);

                done();

            }, error => {
                console.log(error);
                expect(error).toBeNull();
                expect(false).toBeTruthy("Whoops! I should not be here!");
                done();
            });
        });

        it("should remove FakeActivities by ids in collection", done => {

            // Given
            const ids = ["00001", "00003"];

            // When
            const promise: Promise<FakeActivity[]> = <Promise<FakeActivity[]>>
                desktopDataStore.removeByIds(FAKE_ACTIVITIES_STORAGE_LOCATION, ids, []);

            // Then
            promise.then((fakeActivities: FakeActivity[]) => {

                expect(fakeActivities.length).toEqual(1);

                let compressedStreams = _.find(fakeActivities, {activityId: ids[0]});
                expect(_.isEmpty(compressedStreams)).toBeTruthy();

                compressedStreams = _.find(fakeActivities, {activityId: ids[1]});
                expect(_.isEmpty(compressedStreams)).toBeTruthy();

                compressedStreams = _.find(fakeActivities, {activityId: "00002"});
                expect(_.isEmpty(compressedStreams)).toBeFalsy();

                done();

            }, error => {
                expect(error).toBeNull();
                expect(false).toBeTruthy("Whoops! I should not be here!");
                done();
            });

        });

        it("should reject remove FakeActivities by ids when not a collection", done => {

            // Given
            const ids = ["00001", "00003"];

            const fakeObjectStorageLocationModel = new StorageLocationModel("fakeSyncedActivity", StorageType.OBJECT, "activityId");

            // When
            const promise: Promise<FakeActivity[]> = <Promise<FakeActivity[]>>
                desktopDataStore.removeByIds(fakeObjectStorageLocationModel, ids, []);

            // Then
            promise.then(() => {

                expect(false).toBeTruthy("Whoops! I should not be here!");
                done();

            }, error => {
                expect(error).not.toBeNull();

                done();
            });

        });

        it("should reject upsert of a FakeActivity collection", done => {

            // Given
            const newValue = "foo";
            const updatePath = ["none"];

            // When
            const promise = desktopDataStore.putAt(FAKE_ACTIVITIES_STORAGE_LOCATION, updatePath, newValue, []);

            // Then
            promise.then(() => {
                expect(false).toBeTruthy("Whoops! I should not be here!");
                done();

            }, error => {
                expect(error).not.toBeNull();
                expect(error).toEqual("Cannot save property to a collection");
                done();
            });
        });

        it("should clear FakeActivity collection", done => {

            // When
            const promise: Promise<void> = desktopDataStore.clear(FAKE_ACTIVITIES_STORAGE_LOCATION);

            // Then
            promise.then(() => {

                testDatabase.find({
                    selector: {
                        _id: {$regex: "^" + FAKE_ACTIVITIES_STORAGE_LOCATION.key + DesktopDataStore.POUCH_DB_ID_LIST_SEPARATOR + ".*"}
                    }
                }).then(results => {
                    expect(results.docs.length).toEqual(0);
                    done();
                });

            }, error => {
                expect(error).toBeNull();
                expect(false).toBeTruthy("Whoops! I should not be here!");
                done();
            });
        });
    });

    describe("Handle single value", () => {

        it("should fetch a FakeDateTime as single value", done => {

            // Given
            const expectedFakeDateTime = (<FakeDateTime> _.find(FAKE_EXISTING_DOCUMENTS, {_id: "fakeDateTime"})).$value;

            // When
            const promise: Promise<number> = desktopDataStore.fetch(FAKE_DATE_TIME_STORAGE_LOCATION, null);

            // Then
            promise.then((fakeDateTime: number) => {

                expect(fakeDateTime).toEqual(expectedFakeDateTime);

                done();

            }, error => {
                expect(error).toBeNull();
                expect(false).toBeTruthy("Whoops! I should not be here!");
                done();
            });

        });

        it("should fetch default storage value when FakeDateTime is missing in database", done => {

            // Given
            const defaultStorageValue = null;
            const promiseMissingCollection = testDatabase.destroy().then(() => { // Clean database and only enter 1 row (a fake athlete)
                const fakeAthlete = _.cloneDeep(_.find(FAKE_EXISTING_DOCUMENTS, {_id: "fakeAthlete"}));
                resetTestDatabase();
                testDatabase.put(fakeAthlete).then(() => {
                    return Promise.resolve();
                });
            });

            // When
            const promise: Promise<number> = promiseMissingCollection.then(() => {
                return desktopDataStore.fetch(FAKE_DATE_TIME_STORAGE_LOCATION, defaultStorageValue);
            });

            // Then
            promise.then((fakeDateTime: number) => {
                expect(fakeDateTime).toEqual(defaultStorageValue);
                done();
            }, error => {
                expect(error).toBeNull();
                expect(false).toBeTruthy("Whoops! I should not be here!");
                done();
            });

        });

        it("should get by id a FakeDateTime as single value", done => {

            // Given
            const id = "fakeDateTime";
            const expectedFakeDateTime: FakeDateTime = <FakeDateTime> _.find(FAKE_EXISTING_DOCUMENTS, {_id: id});

            // When
            const promise: Promise<number> = desktopDataStore.getById(FAKE_DATE_TIME_STORAGE_LOCATION, id);

            // Then
            promise.then((fakeDateTime: number) => {

                expect(fakeDateTime).toEqual(expectedFakeDateTime.$value);
                done();

            }, error => {
                expect(error).toBeNull();
                expect(false).toBeTruthy("Whoops! I should not be here!");
                done();
            });
        });

        it("should save and replace a FakeDateTime single value", done => {

            // Given
            const newDateTime = _.random(10000);

            // When
            const promise: Promise<number> = <Promise<number>> desktopDataStore.save(FAKE_DATE_TIME_STORAGE_LOCATION, newDateTime, null);

            // Then
            promise.then((fakeDateTime: number) => {

                expect(fakeDateTime).toEqual(newDateTime);

                done();

            }, error => {
                expect(error).toBeNull();
                expect(false).toBeTruthy("Whoops! I should not be here!");
                done();
            });

        });

        it("should save a FakeDateTime when FakeDateTime is missing in database", done => {

            // Given
            const newDateTime = _.random(10000);
            const expectedCalledWith: FakeDateTime = {
                _id: FAKE_DATE_TIME_STORAGE_LOCATION.key,
                $doctype: FAKE_DATE_TIME_STORAGE_LOCATION.key,
                $value: newDateTime
            };

            let putSpy: Spy;

            const promiseMissingCollection = testDatabase.destroy().then(() => { // Clean database and only enter 1 row (a fake athlete)
                const fakeAthlete = _.cloneDeep(_.find(FAKE_EXISTING_DOCUMENTS, {_id: "fakeAthlete"}));
                resetTestDatabase();
                testDatabase.put(fakeAthlete).then(() => {
                    putSpy = spyOn(testDatabase, "put").and.callThrough();
                    return Promise.resolve();
                });
            });

            // When
            const promise: Promise<number> = promiseMissingCollection.then(() => {
                return <Promise<number>> desktopDataStore.save(FAKE_DATE_TIME_STORAGE_LOCATION, newDateTime, null);
            });

            // Then
            promise.then((fakeDateTime: number) => {
                expect(fakeDateTime).toEqual(newDateTime);
                expect(putSpy).toHaveBeenCalledWith(expectedCalledWith);
                done();
            }, error => {
                expect(error).toBeNull();
                expect(false).toBeTruthy("Whoops! I should not be here!");
                done();
            });

        });

        it("should put (create) a FakeDateTime as single value", done => {

            // Given
            const newDateTime = _.random(10000);
            const expectedCalledWith: FakeDateTime = {
                _id: FAKE_DATE_TIME_STORAGE_LOCATION.key,
                $doctype: FAKE_DATE_TIME_STORAGE_LOCATION.key,
                $value: newDateTime
            };

            let putSpy: Spy;

            const promiseMissingCollection = testDatabase.destroy().then(() => { // Clean database and only enter 1 row (a fake athlete)
                resetTestDatabase();
                putSpy = spyOn(testDatabase, "put").and.callThrough();
                return Promise.resolve();
            });

            // When
            const promise: Promise<number> = promiseMissingCollection.then(() => {
                return desktopDataStore.put(FAKE_DATE_TIME_STORAGE_LOCATION, newDateTime);
            });

            // Then
            promise.then((fakeDateTime: number) => {
                expect(fakeDateTime).toEqual(newDateTime);
                expect(putSpy).toHaveBeenCalledWith(expectedCalledWith);
                done();

            }, error => {
                expect(error).toBeNull();
                expect(false).toBeTruthy("Whoops! I should not be here!");
                done();
            });
        });

        it("should put (update) a FakeDateTime as single value", done => {

            // Given
            const newDateTime = 666;
            const docId = FAKE_DATE_TIME_STORAGE_LOCATION.key;
            const expectedCalledWith: FakeDateTime = {
                _id: docId,
                $doctype: docId,
                $value: newDateTime
            };

            let putSpy: Spy;

            const promiseSetRevision = testDatabase.get(docId).then(doc => {
                expectedCalledWith[DesktopDataStore.POUCH_DB_REV_FIELD] = doc._rev;
                putSpy = spyOn(testDatabase, "put").and.callThrough();
                return Promise.resolve();
            });

            // When
            const promise: Promise<number> = promiseSetRevision.then(() => {
                return desktopDataStore.put(FAKE_DATE_TIME_STORAGE_LOCATION, newDateTime);
            });

            // Then
            promise.then((fakeDateTime: number) => {

                expect(fakeDateTime).toEqual(newDateTime);
                expect(putSpy).toHaveBeenCalledWith(expectedCalledWith);

                done();

            }, error => {
                expect(error).toBeNull();
                expect(false).toBeTruthy("Whoops! I should not be here!");
                done();
            });
        });

        it("should reject upsert of a FakeDateTime value", done => {

            // Given
            const newValue = 444;
            const updatePath = ["none"];

            // When
            const promise = desktopDataStore.putAt(FAKE_DATE_TIME_STORAGE_LOCATION, updatePath, newValue, null);

            // Then
            promise.then(() => {
                expect(false).toBeTruthy("Whoops! I should not be here!");
                done();

            }, error => {
                expect(error).not.toBeNull();
                expect(error).toEqual("Cannot save property of a value");
                done();
            });

        });

        it("should clear FakeDateTime value", done => {

            // When
            const promise: Promise<void> = desktopDataStore.clear(FAKE_DATE_TIME_STORAGE_LOCATION);

            // Then
            promise.then(() => {

                testDatabase.find({
                    selector: {
                        _id: {$eq: FAKE_DATE_TIME_STORAGE_LOCATION.key}
                    }
                }).then(results => {
                    expect(results.docs.length).toEqual(0);
                    done();
                });

            }, error => {
                expect(error).toBeNull();
                expect(false).toBeTruthy("Whoops! I should not be here!");
                done();
            });
        });

    });

    it("should return null when get by id a has no results (collection, object & single value)", done => {

        // Given
        const id = "fakeSyncedActivity:00010";

        // When
        const promise: Promise<FakeActivity> = desktopDataStore.getById(FAKE_ACTIVITIES_STORAGE_LOCATION, id);

        // Then
        promise.then((fakeActivity: FakeActivity) => {

            expect(fakeActivity).toEqual(null);
            done();

        }, error => {
            expect(error).toBeNull();
            expect(false).toBeTruthy("Whoops! I should not be here!");
            done();
        });
    });

    describe("Handle create & load PouchDB dumps", () => {

        const mockPouchDatabase = (name: string): any => {
            return {
                name: name,
                allDocs: () => {
                    return Promise.resolve({rows: []});
                },
                bulkDocs: () => {
                    return Promise.resolve();
                },
                destroy: () => {
                    return Promise.resolve();
                }
            };
        };

        it("should create a PouchDB dump", done => {

            // Given
            const fakeDb1Key = "fakeDb1";
            const fakeDb2Key = "fakeDb2";
            const pouchDB1 = mockPouchDatabase(fakeDb1Key);
            const pouchDB2 = mockPouchDatabase(fakeDb2Key);
            DesktopDataStore.STORAGE_DB_MAP.push({storageKey: fakeDb1Key, database: pouchDB1});
            DesktopDataStore.STORAGE_DB_MAP.push({storageKey: fakeDb2Key, database: pouchDB2});

            const pouchDB1AllDocsSpy = spyOn(pouchDB1, "allDocs").and.callThrough();
            const pouchDB2AllDocsSpy = spyOn(pouchDB2, "allDocs").and.callThrough();
            const stringifySpy = spyOn(JSON, "stringify").and.callThrough();

            // When
            const promise = desktopDataStore.createDump();

            // Then
            promise.then((blobResult: Blob) => {

                expect(blobResult).not.toBeNull();
                expect(pouchDB1AllDocsSpy).toHaveBeenCalledTimes(1);
                expect(pouchDB2AllDocsSpy).toHaveBeenCalledTimes(1);
                expect(stringifySpy).toHaveBeenCalledTimes(1);

                done();

            }, error => {
                expect(error).toBeNull();
                expect(false).toBeTruthy("Whoops! I should not be here!");
                done();
            });
        });

        it("should load an elevate dump", done => {

            // Given
            const docs = [
                {_id: "foo", data: "foo"},
                {_id: "bar", data: "bar"},
            ];
            const gzippedDatabases = {
                fakeDb1: docs,
                fakeDb2: docs,
            };

            const fakeDb1Key = "fakeDb1";
            const fakeDb2Key = "fakeDb2";
            const pouchDB1 = mockPouchDatabase(fakeDb1Key);
            const pouchDB2 = mockPouchDatabase(fakeDb2Key);

            const flushIndexedDatabasesSpy = spyOn(desktopDataStore, "flushIndexedDatabases").and.returnValue(Promise.resolve());
            const pouchDB1BulkDocsSpy = spyOn(pouchDB1, "bulkDocs").and.callThrough();
            const pouchDB2BulkDocsSpy = spyOn(pouchDB2, "bulkDocs").and.callThrough();

            provideDatabaseSpy.and.returnValues(pouchDB1, pouchDB2);

            const desktopDumpModel: DesktopDumpModel = new DesktopDumpModel("1.0.0", Gzip.pack(JSON.stringify(gzippedDatabases)));

            // When
            const promise = desktopDataStore.loadDump(desktopDumpModel);

            // Then
            promise.then(() => {

                expect(flushIndexedDatabasesSpy).toHaveBeenCalledTimes(1);
                expect(pouchDB1BulkDocsSpy).toHaveBeenCalledTimes(1);
                expect(pouchDB2BulkDocsSpy).toHaveBeenCalledTimes(1);
                done();

            }, error => {
                expect(error).toBeNull();
                expect(false).toBeTruthy("Whoops! I should not be here!");
                done();
            });
        });

        it("should reject load of an elevate dump (corrupted)", done => {

            // Given
            const expectedVersion = "2.0.0";
            const flushIndexedDatabasesSpy = spyOn(desktopDataStore, "flushIndexedDatabases").and.returnValue(Promise.resolve());

            const expectedRows = [
                {id: 1, data: "foo"},
                {id: 2, data: "Bar"},
            ];

            const docs = {
                version: expectedVersion,
                docs: expectedRows
            };

            // ... prepare dump
            let fakeCompressedDocs = Gzip.pack(JSON.stringify(docs));

            // ... Ensure dump is corrupted
            fakeCompressedDocs = fakeCompressedDocs.slice(0, fakeCompressedDocs.length / 1.5);

            const desktopDumpModel: DesktopDumpModel = new DesktopDumpModel("1.0.0", fakeCompressedDocs);

            // When
            const promise = desktopDataStore.loadDump(desktopDumpModel);

            // Then
            promise.then(() => {
                expect(false).toBeTruthy("Whoops! I should not be here!");
                done();

            }, error => {
                expect(flushIndexedDatabasesSpy).not.toHaveBeenCalled();
                expect(error).not.toBeNull();
                done();
            });
        });

    });

});
