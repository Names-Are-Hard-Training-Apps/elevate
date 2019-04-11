import { Inject } from "@angular/core";
import { LastSyncDateTimeDao } from "../../dao/sync/last-sync-date-time.dao";
import { ActivityDao } from "../../dao/activity/activity.dao";
import { saveAs } from "file-saver";
import * as moment from "moment";
import * as _ from "lodash";
import { SyncState } from "./sync-state.enum";
import { environment } from "../../../../environments/environment";
import { AthleteModel, SyncedActivityModel } from "@elevate/shared/models";
import { SyncedBackupModel } from "./synced-backup.model";
import * as semver from "semver";
import { AthleteService } from "../athlete/athlete.service";
import { UserSettingsService } from "../user-settings/user-settings.service";
import { Constant } from "@elevate/shared/constants";
import { LoggerService } from "../logging/logger.service";
import { VERSIONS_PROVIDER, VersionsProvider } from "../versions/versions-provider.interface";

export abstract class SyncService {

	constructor(@Inject(VERSIONS_PROVIDER) public versionsProvider: VersionsProvider,
				public lastSyncDateTimeDao: LastSyncDateTimeDao,
				public activityDao: ActivityDao,
				public athleteService: AthleteService,
				public userSettingsService: UserSettingsService,
				public logger: LoggerService) {

	}

	public abstract sync(fastSync: boolean, forceSync: boolean): void;

	/**
	 *
	 * @returns {Promise<number>}
	 */
	public getLastSyncDateTime(): Promise<number> {
		return (<Promise<number>> this.lastSyncDateTimeDao.fetch());
	}

	/**
	 *
	 * @param {number} value
	 * @returns {Promise<number>}
	 */
	public saveLastSyncTime(value: number): Promise<number> {
		return (<Promise<number>> this.lastSyncDateTimeDao.save(value));
	}

	/**
	 *
	 * @returns {Promise<number>}
	 */
	public clearLastSyncTime(): Promise<void> {
		return this.lastSyncDateTimeDao.clear();
	}

	/**
	 *
	 * @param {SyncedBackupModel} importedBackupModel
	 * @returns {Promise<SyncedBackupModel>}
	 */
	public import(importedBackupModel: SyncedBackupModel): Promise<SyncedBackupModel> {

		if (_.isEmpty(importedBackupModel.syncedActivities)) {
			return Promise.reject("Activities are not defined or empty in provided backup file. Try to perform a clean full re-sync.");
		}

		if (_.isEmpty(importedBackupModel.pluginVersion)) {
			return Promise.reject("Plugin version is not defined in provided backup file. Try to perform a clean full re-sync.");
		}

		return this.versionsProvider.getInstalledAppVersion().then(appVersion => {

			if (environment.skipRestoreSyncedBackupCheck) {
				return Promise.resolve();
			}

			// Check if imported backup is compatible with current code
			if (semver.lt(importedBackupModel.pluginVersion, this.getCompatibleBackupVersionThreshold())) {
				return Promise.reject("Imported backup version " + importedBackupModel.pluginVersion
					+ " is not compatible with current installed version " + appVersion + ".");
			} else {
				return Promise.resolve();
			}

		}).then(() => {

			return this.clearSyncedData();

		}).then(() => {

			let promiseImportDatedAthleteSettings;

			// If no dated athlete settings provided in backup then reset dated athlete settings
			if (_.isEmpty(importedBackupModel.athleteModel)) {
				promiseImportDatedAthleteSettings = this.athleteService.resetSettings();
			} else {
				promiseImportDatedAthleteSettings = this.athleteService.save(importedBackupModel.athleteModel);
			}

			return Promise.all([
				this.saveLastSyncTime(importedBackupModel.lastSyncDateTime),
				this.activityDao.save(importedBackupModel.syncedActivities),
				promiseImportDatedAthleteSettings,
				this.userSettingsService.clearLocalStorageOnNextLoad()
			]);

		}).then((result: Object[]) => {

			const lastSyncDateTime: number = result[0] as number;
			const syncedActivityModels: SyncedActivityModel[] = result[1] as SyncedActivityModel[];
			const athleteModel: AthleteModel = result[2] as AthleteModel;

			const backupModel: SyncedBackupModel = {
				lastSyncDateTime: lastSyncDateTime,
				syncedActivities: syncedActivityModels,
				athleteModel: athleteModel,
				pluginVersion: importedBackupModel.pluginVersion
			};

			return Promise.resolve(backupModel);
		});
	}

	/**
	 *
	 * @returns {Promise<{filename: string; size: number}>}
	 */
	public export(): Promise<{ filename: string, size: number }> {

		return this.prepareForExport().then((backupModel: SyncedBackupModel) => {

			// // TODO compress/uncompressed later:
			// const blob = new Blob([Utils.gzipToBin<SyncedBackupModel>(backupModel)], {type: "application/gzip"});
			// const filename = moment().format("Y.M.D-H.mm") + "_v" + backupModel.pluginVersion + ".history.gzip";

			const blob = new Blob([JSON.stringify(backupModel)], {type: "application/json; charset=utf-8"});
			const filename = moment().format("Y.M.D-H.mm") + "_v" + backupModel.pluginVersion + ".history.json";
			this.saveAs(blob, filename);
			return Promise.resolve({filename: filename, size: blob.size});

		}, error => {
			return Promise.reject(error);
		});
	}

	/**
	 *
	 * @returns {Promise<SyncedBackupModel>}
	 */
	public prepareForExport(): Promise<SyncedBackupModel> {

		return Promise.all([

			this.lastSyncDateTimeDao.fetch(),
			this.activityDao.fetch(),
			this.athleteService.fetch(),
			this.versionsProvider.getInstalledAppVersion()

		]).then((result: Object[]) => {

			const lastSyncDateTime: number = result[0] as number;
			const syncedActivityModels: SyncedActivityModel[] = result[1] as SyncedActivityModel[];
			const athleteModel: AthleteModel = result[2] as AthleteModel;
			const appVersion: string = result[3] as string;

			if (!_.isNumber(lastSyncDateTime)) {
				return Promise.reject("Cannot export. No last synchronization date found.");
			}

			const backupModel: SyncedBackupModel = {
				lastSyncDateTime: lastSyncDateTime,
				syncedActivities: syncedActivityModels,
				athleteModel: athleteModel,
				pluginVersion: appVersion
			};

			return Promise.resolve(backupModel);
		});
	}

	/**
	 *
	 * @returns {Promise<void>}
	 */
	public clearSyncedData(): Promise<void> {

		return Promise.all([
			this.clearLastSyncTime(),
			this.activityDao.clear()
		]).then(() => {
			return Promise.resolve();
		}).catch(error => {
			this.logger.error(error);
			return Promise.reject("Athlete synced data has not been cleared totally. " +
				"Some properties cannot be deleted. You may need to uninstall/install the software.");
		});
	}

	/**
	 *
	 * @returns {Promise<SyncState>}
	 */
	public getSyncState(): Promise<SyncState> {

		return Promise.all([

			this.getLastSyncDateTime(),
			this.activityDao.fetch()

		]).then((result: Object[]) => {

			const lastSyncDateTime: number = result[0] as number;
			const syncedActivityModels: SyncedActivityModel[] = result[1] as SyncedActivityModel[];

			const hasLastSyncDateTime: boolean = _.isNumber(lastSyncDateTime);
			const hasSyncedActivityModels: boolean = !_.isEmpty(syncedActivityModels);

			let syncState: SyncState;
			if (!hasLastSyncDateTime && !hasSyncedActivityModels) {
				syncState = SyncState.NOT_SYNCED;
			} else if (!hasLastSyncDateTime && hasSyncedActivityModels) {
				syncState = SyncState.PARTIALLY_SYNCED;
			} else {
				syncState = SyncState.SYNCED;
			}

			return Promise.resolve(syncState);
		});
	}


	/**
	 * @returns {string} Backup version threshold at which a "greater or equal" imported backup version is compatible with current code.
	 */
	public getCompatibleBackupVersionThreshold(): string {
		return Constant.COMPATIBLE_BACKUP_VERSION_THRESHOLD;
	}

	/**
	 *
	 * @param {Blob} blob
	 * @param {string} filename
	 */
	public saveAs(blob: Blob, filename: string): void {
		saveAs(blob, filename);
	}
}
