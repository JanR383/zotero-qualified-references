import { assert } from "chai";
import { config } from "../package.json";

describe("startup", function () {
  it("should have plugin instance defined", function () {
    assert.isNotEmpty(Zotero[config.addonInstance]);
  });

  // CI runs the suite against several Zotero channels; putting the version
  // into the reported title shows which one each run exercised.
  it("reports the Zotero version", function () {
    assert.isString(Zotero.version);
    this.test!.title = `runs on Zotero ${Zotero.version}`;
  });
});
