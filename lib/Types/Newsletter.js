"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.XWAPaths = exports.MexOperations = void 0;
var MexOperations;
(function (MexOperations) {
    MexOperations["PROMOTE"] = "NotificationNewsletterAdminPromote";
    MexOperations["DEMOTE"] = "NotificationNewsletterAdminDemote";
    MexOperations["UPDATE"] = "NotificationNewsletterUpdate";
    MexOperations["READ"] = "NotificationNewsletterRead"; // Added operation for reading
    MexOperations["RESPOND"] = "NotificationNewsletterRespond"; // Added operation for responding
})(MexOperations || (exports.MexOperations = MexOperations = {}));
var XWAPaths;
(function (XWAPaths) {
    XWAPaths["PROMOTE"] = "xwa2_notify_newsletter_admin_promote";
    XWAPaths["DEMOTE"] = "xwa2_notify_newsletter_admin_demote";
    XWAPaths["ADMIN_COUNT"] = "xwa2_newsletter_admin";
    XWAPaths["CREATE"] = "xwa2_newsletter_create";
    XWAPaths["NEWSLETTER"] = "xwa2_newsletter";
    XWAPaths["METADATA_UPDATE"] = "xwa2_notify_newsletter_on_metadata_update";
    XWAPaths["READ"] = "xwa2_notify_newsletter_read"; // Added path for reading
    XWAPaths["RESPOND"] = "xwa2_notify_newsletter_respond"; // Added path for responding
})(XWAPaths || (exports.XWAPaths = XWAPaths = {}));