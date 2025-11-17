const STEPS = {
    "readBiom": {
        "name": "readBiom",
        "status": "pending",
        "message": "Reading BIOM",
        "messagePending": "Read BIOM"
      },
      "writeDwcDp": {
        "name": "writeDwcDp",
        "status": "pending",
        "message": "Writing DWC data package",
        "messagePending": "Write DWC data package"
      },
      "parquetConversion": {
        "name": "parquetConversion",
        "status": "pending",
        "message": "Write Parquet format",
        "messagePending": "Write Parquet format"
      },
      "zipDataPackage": {
        "name": "zipDataPackage",
        "status": "pending",
        "message": "Zipping files",
        "messagePending": "Zip files"
      },
      "cleanUp": {
        "name": "cleanUp",
        "status": "pending",
        "message": "Cleaning up files",
        "messagePending": "Clean up files"
      }

}

export default STEPS;