export class Constant {
  /**
   * Shared between appcore/extension
   */
  public static readonly KM_TO_MILE_FACTOR: number = 0.621371;
  public static readonly METER_TO_FEET_FACTOR: number = 3.28084;

  /**
   * For appcore only
   */

  // Used to indicated if user checked helper before reporting a bug
  public static readonly SESSION_HELPER_OPENED: string = "SESSION_HELPER_OPENED";

  /**
   * For extension only
   */
  public static readonly LANDING_PAGE_URL: string = "https://thomaschampagne.github.io/elevate/";
  public static readonly APP_ROOT_URL: string = "/app/index.html";
}