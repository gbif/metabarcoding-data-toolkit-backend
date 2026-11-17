import * as url from "url";
import fs from "fs";
import { getEml } from "../util/Eml/index.js";
import {
  writeEmlJson,
  writeEmlXml,
  getCurrentDatasetVersion,
} from "../util/filesAndDirectories.js";
import auth from "./Auth/auth.js";
import { gbifAuthorization, sendGbifLoginRequired } from "./Auth/tokens.js";
import db from "./db/index.js";
import config from "../config.js";
import axios from "axios";
const baseUrl =
  config.env === "prod" ? config.gbifBaseUrl.prod : config.gbifBaseUrl.uat;

const getOrganizations = async (req, res) => {
  try {
    const response = await axios.get(
      `${baseUrl}organization/suggest?q=${req.query.q}`,
    );
    res.send(response?.data);
  } catch (error) {
    console.log(error);
    res.sendStatus(500);
  }
};

const getInstallationContactEmail = async (req, res) => {
  try {
    const installationContactEmail = config.installationContactEmail;
    res.send({ installationContactEmail });
  } catch (error) {
    console.log(error);
    res.sendStatus(500);
  }
};

const getInstallationSettings = async (req, res) => {
  try {
    const installationContactEmail = config.installationContactEmail;
    const prodPublishingEnabled = config.prodPublishingEnabled;
    const termsLink = config.termsLink;
    const nodeKey = config.nodeKey;
    const gbifRegistryBaseUrl = config.gbifRegistryBaseUrl[config.env];
    const title = config?.title;
    const description = config?.description;
    const settings = {
      installationContactEmail,
      prodPublishingEnabled,
      termsLink,
      nodeKey,
      gbifRegistryBaseUrl,
      title,
      description,
    };
    res.send(settings);
  } catch (error) {
    console.log(error);
    res.sendStatus(500);
  }
};

const getInstallationAdmins = async (req, res) => {
  try {
    if (req?.user?.isSupportAdmin) {
      const installationAdmins = config.installationAdmins;
      const supportAdmins = config.supportAdmins;

      const admins = {
        installationAdmins,
        supportAdmins,
      };
      res.send(admins);
    } else {
      res.sendStatus(403);
    }
  } catch (error) {
    console.log(error);
    res.sendStatus(500);
  }
};

const getOrganizationToken = async (req, res) => {
  // The registry decides whether this GBIF account may see the organization's token
  const authorization = gbifAuthorization(req.user?.userName);
  if (!authorization) {
    return sendGbifLoginRequired(res, req.user?.userName);
  }
  try {
    let options = {
      method: "get",
      url: `${config.gbifRegistryBaseUrl[config.env === "prod" ? "prod" : "uat"]}organization/${req?.params?.key}/password`,
      headers: {
        authorization,
      },
    };
    const response = await axios(options);

    res.send(response?.data);
  } catch (error) {
    console.log(error?.response?.status || error);
    if (error?.response?.status === 401) {
      sendGbifLoginRequired(res, req.user?.userName);
    } else {
      res.sendStatus(error?.response?.status || 500);
    }
  }
};

export default (app) => {
  app.get("/organization/:key/password", auth.appendUser(), auth.webSessionOnly(), getOrganizationToken);
  app.get("/organization/suggest", getOrganizations);
  app.get("/installation-contact-email", getInstallationContactEmail);
  app.get("/installation-settings", getInstallationSettings);
  app.get("/installation-admins", auth.appendUser(), getInstallationAdmins);
};
