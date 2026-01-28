sap.ui.define([
	"com/9b/clonePlanner2/controller/BaseController",
	"sap/ui/core/Fragment",
	"sap/ui/model/Filter",
	"sap/ui/model/FilterOperator",
	"com/9b/clonePlanner2/model/models",
	"sap/ndc/BarcodeScanner",
	"sap/ui/core/format/DateFormat"
], function (BaseController, Fragment, Filter, FilterOperator, model, BarcodeScanner, DateFormat) {
	"use strict";

	return BaseController.extend("com.9b.clonePlanner2.controller.ClonePlanner", {
		formatter: model,

		onInit: function () {
			/*	this.byId("locDropDown").setFilterFunction(function (sTerm, oItem) {
					// A case-insensitive "string contains" style filter
					return oItem.getText().match(new RegExp(sTerm, "i"));
					testing intial
				});*/

			if (!this._busyDialog) {
				this._busyDialog = sap.ui.xmlfragment("busy", "com.9b.clonePlanner2.view.fragments.BusyDialog", this);
				this.getView().addDependent(this._busyDialog);
			}

			this.getAppConfigData();
			this.hanldeMessageDialog();
			var clonePlannerTable = this.getView().byId("clonePlannerTable");
			var tableHeader = this.byId("tableHeader");
			clonePlannerTable.addEventDelegate({
				onAfterRendering: function () {
					var oBinding = this.getBinding("rows");
					oBinding.attachChange(function (oEvent) {
						var oSource = oEvent.getSource();
						var count = oSource.iLength; //Will fetch you the filtered rows length
						var totalCount = oSource.oList.length;
						tableHeader.setText("Batches (" + count + "/" + totalCount + ")");
					});
				}
			}, clonePlannerTable);
			this.combinedFilter = [];
			this.getOwnerComponent().getRouter(this).attachRoutePatternMatched(this._objectMatched, this);
			var that = this;
			setInterval(function () {
				that.loadMasterData();
			}, 1800000);
		},

		_objectMatched: function (oEvent) {
			if (oEvent.getParameter("name") === "clonePlanner") {
				this.getView().byId("clonePlannerTable").clearSelection();
				var jsonModel = this.getOwnerComponent().getModel("jsonModel");
				jsonModel.setProperty("/tagArray", []);
				jsonModel.setProperty("/isSingleSelect", false);
				jsonModel.setProperty("/changeStrainsSelect", false);
				jsonModel.setProperty("/changeItemTypeSelect", false);
				this.loadMasterLocations();
				this.getMetricsCredentials();
			}
		},

		/** Method for clear all filters**/
		clearAllFilters: function () {
			this.onCloseRefreshChart();
			var filterTable = this.getView().byId("clonePlannerTable");
			var aColumns = filterTable.getColumns();
			for (var i = 0; i <= aColumns.length; i++) {
				filterTable.filter(aColumns[i], null);
				filterTable.sort(aColumns[i], null);
			}
			this.byId("searchFieldTable").removeAllTokens();
		},

		loadMasterLocations: function () {
			var that = this;
			var compressedLisence = [];
			var jsonModel = this.getOwnerComponent().getModel("jsonModel");
			jsonModel.setProperty("/busyView", true);
			var sFilters = "?$filter=Inactive eq 'tNO' and not(startswith(Sublevel1,'SYSTEM'))";
			var sSelect = "&$select=BinCode,U_MetrcLicense,U_MetrcLocation,U_Branch,AbsEntry,Warehouse";
			var order = "&$orderby=U_MetrcLicense asc,BinCode asc";

			this.readServiecLayer("/b1s/v2/UsersService_GetCurrentUser", function (data2) {
				var userAccessLicense = JSON.parse(data2.U_License);
				if (userAccessLicense != null) {
					jsonModel.setProperty("/userAccessLicense", userAccessLicense);
				}

				this.readServiecLayer("/b1s/v2/BinLocations" + sFilters + sSelect + order, function (data) {
					if (userAccessLicense && userAccessLicense != undefined && userAccessLicense.length > 0) {
						$.each(userAccessLicense, function (i, m) {
							$.each(data.value, function (j, n) {
								if (m.key == n.U_MetrcLicense) {
									compressedLisence.push(n);
								}
							});

						});
						jsonModel.setProperty("/busyView", false);
						jsonModel.setProperty("/licenseList", compressedLisence);
						jsonModel.setProperty("/sLinObj", compressedLisence[0]);
						jsonModel.setProperty("/selectedLicense", compressedLisence[0].U_MetrcLicense);
						jsonModel.setProperty("/selectedLocation", compressedLisence[0].U_MetrcLocation);
						jsonModel.setProperty("/selectedLocationDesc", compressedLisence[0].BinCode + " - " + compressedLisence[0].U_MetrcLicense);
						jsonModel.setProperty("/selectedBinCode", compressedLisence[0].BinCode);
						jsonModel.setProperty("/selectedWarehouse", compressedLisence[0].Warehouse);
						jsonModel.setProperty("/selectedAbsEntry", compressedLisence[0].AbsEntry);
						jsonModel.refresh(true);
						that.loadLocationData();
						//	that.loadCloneItems();
						that.loadWasteMethodData();
						that.loadWasteResonData();
						that.loadMasterData();

					} else {
						jsonModel.setProperty("/busyView", false);
						sap.m.MessageBox.error("Locations not available for this user");
					}
				});
			});
		},

		onChanageLicenseType: function (evt) {
			var jsonModel = this.getOwnerComponent().getModel("jsonModel");
			if (evt.getSource().getSelectedItem()) {
				evt.getSource().setValueState("None");
				var sObj = evt.getSource().getSelectedItem().getBindingContext("jsonModel").getObject();
				jsonModel.setProperty("/sLinObj", sObj);
				jsonModel.setProperty("/selectedLicense", sObj.U_MetrcLicense);
				jsonModel.setProperty("/selectedLocation", sObj.U_MetrcLocation);
				jsonModel.setProperty("/selectedBinCode", sObj.BinCode);
				jsonModel.setProperty("/selectedWarehouse", sObj.Warehouse);
				jsonModel.setProperty("/selectedAbsEntry", sObj.AbsEntry);
				this.loadMasterData();
				this.loadLocationData();
			} else {
				evt.getSource().setValueState("Error");
				evt.getSource().setValueStateText("Invalid Entry");
				evt.getSource().focus();
			}
		},

		loadCloneItems: function () {
			var jsonModel = this.getOwnerComponent().getModel("jsonModel");
			var filters = "?$filter=contains(ItemName,'Clone') or contains(ItemName,'Seeds')";
			filters = filters.replace(/#/g, "%23");
			// filters = filters.replace(/'/g, "%27");
			var fields = "&$select=" + ["ItemName", "ItemsGroupCode", "ItemCode", "U_MCAT", "ProdStdCost", "U_NSTNM", "InventoryUOM"].join();
			jsonModel.setProperty("/ComboBoxBusy", true);
			this.readServiecLayer("/b1s/v2/Items" + filters + fields, function (data1) {
				jsonModel.setProperty("/ComboBoxBusy", false);
				jsonModel.setProperty("/cloneItemList", data1.value);
			});
			var fields22 = "?$select=" + ["ItemName", "ItemsGroupCode", "ItemCode", "U_MCAT", "ProdStdCost", "U_NSTNM", "InventoryUOM",
				"DefaultSalesUoMEntry"
			].join();
			/*	this.readServiecLayer("/b1s/v2/Items" + fields22, function (data2) {
					jsonModel.setProperty("/ComboBoxBusy", false);
					jsonModel.setProperty("/allItemList", data2.value);
				});*/
			this.loadReqItems().then((data1) => {
				jsonModel.setProperty("/allItemList", data1);
			});
		},

		loadSelectedItemCall: function (itemcode) {
			var jsonModel = this.getOwnerComponent().getModel("jsonModel");
			var fields22 = "?$filter=ItemCode eq '" + itemcode + "' &$select=" + ["ItemName", "ItemsGroupCode", "ItemCode", "U_MCAT",
				"ProdStdCost", "U_NSTNM", "InventoryUOM",
				"DefaultSalesUoMEntry"
			].join();
			this.readServiecLayer("/b1s/v2/Items" + fields22, function (data2) {
				jsonModel.setProperty("/ComboBoxBusy", false);
				jsonModel.setProperty("/selectedItemCall", data2.value);
			});
		},

		loadMasterData: function (filters) {
			var that = this;
			var selectedLocation;
			var jsonModel = this.getOwnerComponent().getModel("jsonModel");
			var selectedLocation = jsonModel.getProperty("/selectedLocation");
			var selectedBinCode = jsonModel.getProperty("/selectedBinCode");
			if (!selectedLocation && jsonModel.getProperty("/licenseList").length > 0) {
				selectedLocation = jsonModel.getProperty("/licenseList")[0].U_MetrcLocation;
				selectedBinCode = jsonModel.getProperty("/licenseList")[0].BinCode;
			}
			if (filters === undefined) {
				filters = [];
				filters = "?$filter=BinLocationCode eq " + "'" + selectedBinCode +
					"' and Quantity ne 0 and (U_Phase eq 'Immature' or U_Phase eq 'Veg')&$orderby=CreateDate desc,BatchNum desc";
			} else {
				filters = "?$filter=BinLocationCode eq " + "'" + selectedBinCode +
					"' and Quantity ne 0 and (U_Phase eq 'Immature' or U_Phase eq 'Veg') and (" +
					filters + ")&$orderby=CreateDate desc,BatchNum desc";
			}
			this.readServiecLayer("/b1s/v2/sml.svc/CV_IMMATURE_PLANNER_VW" + filters, function (data) {
				//code for display updated date time
				var cDate = new Date();
				var dateFormat = sap.ui.core.format.DateFormat.getDateTimeInstance({
					pattern: "KK:mm:ss a"
				});
				var refreshText = dateFormat.format(cDate);
				jsonModel.setProperty("/refreshText", "Last Updated " + refreshText);
				jsonModel.setProperty("/refreshState", "Success");
				that.loadChartData(data.value);
				jsonModel.setProperty("/cloneTableData", data.value);
			}, this.getView());
		},

		loadChartData: function (data) {
			var returnData;
			this.byId("tableHeader").setText("Batches (" + data.length + ")");
			var cloneData = [];
			$.each(data, function (i, e) {
				if (e.Quantity !== null && e.Quantity !== 0) {
					for (var j = 1;; j++) {
						var obj = Object.assign({}, e);
						cloneData.push(obj);
						if (j === parseInt(e.Quantity)) {
							break;
						}
					}
				}
			});
			this.byId("clonePlantCount").setText(cloneData.length);
			var returnData1 = this.prepareChartData(cloneData, "ItemName");
			this.getOwnerComponent().getModel("jsonModel").setProperty("/DonutChart", returnData);
			var jsonModel1 = new sap.ui.model.json.JSONModel();
			jsonModel1.setData(returnData1);
			this.byId("idVizFrame1").setModel(jsonModel1);
		},

		prepareChartData: function (data, field) {
			//var dataObj = {};
			var arr = [];
			$.each(data, function (index, info) {
				var object = {};
				object.LABEL = info[field];
				var objRef = $.grep(arr, function (obj) {
					return obj.LABEL === info[field];
				});
				if (objRef && objRef.length > 0) {
					objRef[0].COUNT = parseInt(objRef[0].COUNT, 0) + 1;
				} else {
					object.COUNT = 1;
					object.FIELDNAME = field;
					arr.push(object);
				}
			});
			return arr;
		},

		handlemarkasMother: function () {
			var jsonModel = this.getOwnerComponent().getModel("jsonModel");
			var sItems, that = this;
			var table = this.getView().byId("clonePlannerTable");
			var sArrayObj = [];
			sItems = table.getSelectedIndices();
			var licenseNo = jsonModel.getProperty("/selectedLicense");
			var that = this;
			if (sItems.length > 0) {
				that.readServiecLayer("/b1s/v2/UsersService_GetCurrentUser", function (resP) {
					sap.m.MessageBox.confirm("Are you sure you want to mark them as mother ?", {
						onClose: function (action) {
							if (action === "OK") {
								var sObj, payLoadInventory, batchUrl = [],
									payLoadUpdate;
								$.each(sItems, function (i, e) {
									payLoadInventory = {};
									sObj = table.getContextByIndex(e).getObject();
									var payLoadInventoryEntry = {
										U_Phase: "Mother"
									};
									batchUrl.push({
										url: "/b1s/v2/BatchNumberDetails(" + sObj.BatchAbsEntry + ")",
										data: payLoadInventoryEntry,
										method: "PATCH"
									});
								});
								jsonModel.setProperty("/errorTxt", []);
								that.createBatchCall(batchUrl, function () {
									sap.m.MessageToast.show("Batches moved to mother succsessfully");
									that.byId("clonePlannerTable").setSelectedIndex(-1);
									that.loadMasterData();
								});
							}
						}
					});
				});

			} else {
				sap.m.MessageToast.show("Please select atleast one batch");
			}
		},

		onBeginTagChange: function (evt) {
			var sItems;
			var updateObject;
			var table = this.getView().byId("clonePlannerTable");
			sItems = table.getSelectedIndices();
			updateObject = table.getContextByIndex(sItems).getObject();
			var eQty = Number(sap.ui.core.Fragment.byId("changeGrowthPhaseDialog", "newQtyForEntry").getValue());
			var eQty1 = eQty - 1;
			//var bTagValue = sap.ui.core.Fragment.byId("changeGrowthPhaseDialog", "beggingTag").getValue();
			var bTagValue = evt.getParameters().selectedItem.mProperties.key;
			var selObj = evt.getParameters().selectedItem.getBindingContext("jsonModel").getObject();
			var tagModel = this.getOwnerComponent().getModel("jsonModel").getProperty("/barCodePlantTagData");
			var selectedKey = evt.getSource().getSelectedKey();
			var tagArray = [];
			var flag;
			$.each(tagModel, function (i, e) {
				if (e.Label == selObj.Label) {
					tagArray.push(e);
					flag = i;
				} else if (i <= (flag + eQty1)) {
					tagArray.push(e);
				}
			});
			this.getOwnerComponent().getModel("jsonModel").setProperty("/tagArray", tagArray);
			sap.ui.core.Fragment.byId("changeGrowthPhaseDialog", "endTag").setValue("");
			sap.ui.core.Fragment.byId("changeGrowthPhaseDialog", "endTag").setValue(tagArray[tagArray.length - 1].Label);
		},

		onBeginTagChangeForInput: function (evt) {
			var bTagValue = evt.getParameters().newValue;
			var eQty = Number(sap.ui.core.Fragment.byId("changeGrowthPhaseDialog", "avalQty").getValue());
			if (bTagValue !== "") {
				var formatTagIDString = this.formatTagIDString(bTagValue);
				if (formatTagIDString !== undefined) {
					var startChars = formatTagIDString[0]; // for addition with quantity
					var lastChars = formatTagIDString[1];
				}
				if (startChars !== undefined && isNaN(startChars)) {
					evt.getSource().setValueState("Error");
					evt.getSource().setValueStateText("The Beginning ID format is invalid");
					return;
				} else {
					evt.getSource().setValueState("None");
					if (startChars !== undefined) {
						var eQty = eQty - 1;
						var endTag = lastChars + this.addLeadingZeros((Number(startChars) + Number(eQty)), startChars.length);
						sap.ui.core.Fragment.byId("changeGrowthPhaseDialog", "endTag").setValue("");
						sap.ui.core.Fragment.byId("changeGrowthPhaseDialog", "endTag").setValue(endTag);
					}
				}
			}
		},

		onBegTagBarcodeScan: function (evt) {
			var barCodeInput = evt.getSource();
			//	var that = this;
			BarcodeScanner.scan(
				function (mResult) {
					var value = mResult.text;
					barCodeInput.setValue(value);
				},
				function (Error) {
					sap.m.MessageToast.show("Scanning failed: " + Error);
				}
			);
		},

		/*** change strain starts ****/

		onChangeItemCloseMETRC: function () {
			this.changeItemMETRCDialog.close();
		},
		onSuggestionItemSelected: function (oEvent) {
			var oSource = oEvent.getSource();
			var oContext = oSource.getBindingContext("jsonModel");
			if (!oContext) {
				return;
			}
			var sInputObj = oContext.getObject();
			var selectedItem = oEvent.getParameter("selectedRow");
			if (!selectedItem) {
				sInputObj.STATUSITEM = "Error";
				sInputObj.ITEMTXT = "Invalid selection";
				oSource.focus();
				return;
			}
			var selectedStrainObj = selectedItem.getBindingContext().getObject();
			var itemNameParts = (sInputObj.ItemName || "").split(" - ");
			if (itemNameParts.length < 2) {
				sInputObj.STATUSITEM = "Error";
				sInputObj.ITEMTXT = "Invalid item format";
				oSource.focus();
				return;
			}
			var itemName = itemNameParts[1];
			sInputObj.newItemName = selectedStrainObj.Name + " - " + itemName;
			var filters = "?$filter=ItemName eq '" + encodeURIComponent(sInputObj.newItemName) + "'";
			var fieldsItem = "&$select=" + ["ItemCode", "ItemName", "ProdStdCost", "U_NSTNM"].join();
			oSource.setBusy(true);
			this.readServiecLayer("/b1s/v2/Items" + filters + fieldsItem, function (data1) {
				oSource.setBusy(false);
				if (data1 && data1.value && data1.value.length > 0) {
					sInputObj.NewStrainObj = data1.value[0];
					oSource.setValueState("None");
				} else {
					oSource.setValueState("Error");
					oSource.setValueStateText("The selected item is invalid");
					oSource.focus();
				}
			});
		},

		validateItem: function (evt) {
			var jsonModel = this.getOwnerComponent().getModel("jsonModel");
			var oSource = evt.getSource();
			var sTerm = oSource.getValue();
			var sInputObj = oSource.getBindingContext("jsonModel").getObject();

			sInputObj.newItemName = sTerm;
			var ItemsCallDATA = jsonModel.getProperty("/ItemsDATA");
			var arrITEMS = [];

			$.each(ItemsCallDATA, function (i, obj) {
				if (obj.Name !== null) {
					if (obj.Name && obj.Name.toLowerCase().includes(sTerm.toLowerCase()) == true || obj.Name.includes(
							sTerm) == true) {
						arrITEMS.push(obj);
					}
				}
			});
			if (arrITEMS.length > 0) {
				var localJson = new sap.ui.model.json.JSONModel();
				oSource.setModel(localJson);
				localJson.setProperty("/changeItemsdropdownData", arrITEMS);
				oSource._oSuggestionsTable.oParent.openBy(oSource);
				oSource.setValueState("None");
			} else {
				oSource.setValueState("Error");
				oSource.setValueStateText("The selected item is invalid");
				oSource.focus();
			}

		},

		// valueHelpRequestDialog: function (oEvent) {
		// 	var that = this;
		// 	var jsonModel = this.getView().getModel("jsonModel");
		// 	if (!this.createDialog) {
		// 		this.createDialog = sap.ui.xmlfragment("ItemsDialog", "com.9b.clonePlanner2.view.fragments.Items", this);
		// 		this.getView().addDependent(this.createDialog);
		// 	}
		// 	that.createDialog.refParent = oEvent.getSource();
		// 	sap.ui.core.Fragment.byId("ItemsDialog", "itemTable").clearSelection();
		// 	sap.ui.core.Fragment.byId("ItemsDialog", "searchFieldTableItems").clear();
		// 	that.clearAllFiltersITEMS();
		// 	this.createDialog.open();

		// },

		handlechangeItemsMETRC: function () {
			var that = this;
			var jsonModel = this.getOwnerComponent().getModel("jsonModel");
			var mPkgTable = this.getView().byId("clonePlannerTable");
			var metrcData = jsonModel.getProperty("/metrcData");
			var sItems = mPkgTable.getSelectedIndices();

			// if (metrcData && metrcData.U_NACST === "X") {
			if (sItems.length > 0) {
				if (!this.changeItemMETRCDialog) {
					this.changeItemMETRCDialog = sap.ui.xmlfragment("changeItemMETRC", "com.9b.clonePlanner2.view.fragments.ChangeStrain", this);
					this.getView().addDependent(this.changeItemMETRCDialog);
				}
				var sObj, sArrayObj = [];
				jsonModel.setProperty("/changeItemsData", sArrayObj);
				$.each(sItems, function (i, e) {
					sObj = mPkgTable.getContextByIndex(e).getObject();
					sObj.newItemName = "";
					sObj.newItemCode = "";
					sObj.STATUSITEM = "None";
					sObj.ITEMTXT = "";
					sArrayObj.push(sObj);
				});
				jsonModel.setProperty("/changeItemsData", sArrayObj);
				that.changeItemMETRCDialog.open();
				var licenseNo = jsonModel.getProperty("/selectedLicense");
				var filters = "?$filter=U_MetrcLicense eq " + "'" + licenseNo + "' and not(startswith(BinCode,'LIC'))";
				var fields = "&$select=" + ["U_MetrcLicense", "U_MetrcLocation", "Sublevel2", "BinCode", "AbsEntry", "Warehouse"].join();
				that.changeItemMETRCDialog.setBusy(true);

				this.readServiecLayer("/b1s/v2/U_NSDNMT", function (data1) {
					// console.log(uniquePeople);
					jsonModel.setProperty("/ItemsDATA", data1.value);
					this.readServiecLayer("/b1s/v2/BinLocations" + filters + fields, function (data) {
						that.changeItemMETRCDialog.setBusy(false);
						jsonModel.setProperty("/ChangeLocationList", data.value);
					});
				});

			} else {
				sap.m.MessageToast.show("Please select a batch");
			}

			// } else {
			// 	sap.m.MessageToast.show("METRC SYNC is off");
			// }

		},

		onMETRCConfirmChangeItem: function () {
			var jsonModel = this.getOwnerComponent().getModel("jsonModel");
			var metrcData = jsonModel.getProperty("/metrcData");
			var sItems = this.changeItemMETRCDialog.getContent()[0].getItems();
			var changeItemMETRCDialog = this.changeItemMETRCDialog;
			var that = this;
			var changeItemsData = jsonModel.getProperty("/changeItemsData");
			var ItemsCallDATA = jsonModel.getProperty("/ItemsDATA");
			var isValidated = true;
			$.each(changeItemsData, function (i, sObj) {
				if (sObj.newItemName === "") {
					sObj.STATUSITEM = "Error";
					sObj.ITEMTXT = "Enter Item";
					isValidated = false;
				} else if (sObj.STATUSITEM === "Error") {
					isValidated = false;
				} else {
					sObj.STATUSITEM = "None";
				}

				if (sObj.newItemName != "") {
					var rObj = $.grep(ItemsCallDATA, function (nItem) {
						if (nItem.Name && nItem.Name === sObj.NewStrainObj.U_NSTNM) {
							return nItem;
						}
					});
					if (rObj.length > 0) {
						sObj.STATUSITEM = "None";
					} else {
						isValidated = false;
						sObj.STATUSITEM = "Error";
						sObj.ITEMTXT = "Enter Item";
					}

				}

			});
			if (!isValidated) {
				sap.m.MessageToast.show("Some of the items are invalid");
				return;
			}
			var cDate = that.getSystemDate(new Date());
			var metricPayload = [];
			var noItemCodes = [],
				filterString;
			this._busyDialog.open();
			jsonModel.setProperty("/busyTitle", "Hang tight...");
			jsonModel.setProperty(
				"/busyText",
				"We’re working on Changing strain. Please keep this page open until we’re done."
			);
			setTimeout(function () {
				var isValidated = true;
				$.each(changeItemsData, function (i, sObj) {
					if (sObj.newItemName === "") {
						sObj.STATUSITEM = "Error";
						sObj.ITEMTXT = "Enter Item";
						isValidated = false;
					} else if (sObj.STATUSITEM === "Error") {
						isValidated = false;
					} else {
						sObj.STATUSITEM = "None";
					}
					var pObj = {
						Name: sObj.BatchNum,
						StrainName: sObj.NewStrainObj.U_NSTNM
					};
					metricPayload.push(pObj);
				});

				jsonModel.refresh(true);
				if (isValidated) {
					that.readServiecLayer("/b1s/v2/UsersService_GetCurrentUser", function (resP) {
						if (metrcData && metrcData.U_NACST === "X") {
							var metrcUrl = "/plantbatches/v2/strain?licenseNumber=" + jsonModel.getProperty("/selectedLicense");
							that.callMetricsService(metrcUrl, "PUT", metricPayload, function () {
								sap.m.MessageToast.show("METRC Sync Completed Successfully");
								that.byId("clonePlannerTable").clearSelection();
								// that.loadMasterData();
								that.changeItemInterncallPostings(changeItemsData, jsonModel, changeItemMETRCDialog);
							}, function (error) {
								that._busyDialog.close();
							});
						} else {
							that.changeItemInterncallPostings(changeItemsData, jsonModel, changeItemMETRCDialog);
						}
					});
				}
				// }

			}, 1000);

		},

		changeItemInterncallPostings: function (changeItemsData, jsonModel, changeItemDialog) {
			var ChangeLocationList = jsonModel.getProperty("/ChangeLocationList");
			var cDate = this.getSystemDate(new Date());
			var jsonModel = this.getOwnerComponent().getModel("jsonModel");
			var that = this;
			var count = changeItemsData.length;
			var batchUrl = [];
			var sObj = changeItemsData[0];

			var costingCode, absEntry, ProdStdCost, exitProdStdCost, entryItemcode;
			let modifiedText = sObj.ItemName.replace(sObj.StrainName, "");
			$.each(ChangeLocationList, function (i, k) {
				if (sObj.BinLocationCode == k.BinCode) {
					absEntry = k.AbsEntry;
				}
			});

			var payLoadProduction = {
				"ItemNo": sObj.NewStrainObj.ItemCode,
				"DistributionRule": "NURS",
				"PlannedQuantity": sObj.Quantity, //updateObject.Quantity,
				"ProductionOrderType": "bopotSpecial",
				"PostingDate": cDate,
				"DueDate": cDate,
				"Warehouse": sObj.WhsCode.split("-")[0],
				"Remarks": "Immature Plants - Change Strain",
				"ProductionOrderLines": [{
						"ItemNo": sObj.ItemCode,
						"DistributionRule": "NURS",
						"PlannedQuantity": sObj.Quantity,
						"ProductionOrderIssueType": "im_Manual",
						"Warehouse": sObj.WhsCode.split("-")[0],
					}

				]
			}

			that.updateServiecLayer("/b1s/v2/ProductionOrders", function (res) {
				var docNUM = Number(res.AbsoluteEntry);
				var BaseLine = res;

				var fisrtPatchCall = {
					"ProductionOrderStatus": "boposReleased",
				};

				batchUrl.push({
					url: "/b1s/v2/ProductionOrders(" + docNUM + ")",
					data: fisrtPatchCall,
					method: "PATCH"
				});
				var payLoadInventoryExit = {
					"BPL_IDAssignedToInvoice": jsonModel.getProperty("/sLinObj").U_Branch,
					//	"PaymentGroupCode": 2,
					"Comments": "Immature plants - Change strain",
					"DocumentLines": []
				};
				payLoadInventoryExit.DocumentLines.push({
					"BaseType": 202,
					"BaseEntry": docNUM,
					"BaseLine": 0,
					//	"ItemCode": sObj.ItemCode,
					// "ItmGrpCode": 100,
					"WarehouseCode": sObj.WhsCode,
					"Quantity": sObj.Quantity,
					//	"UnitPrice": Number(exitProdStdCost),
					// "CostingCode": costingCode, exitProdStdCost
					"BatchNumbers": [{
						"BatchNumber": sObj.BatchNum, // <THIS IS TAG>
						"Quantity": sObj.Quantity,
						//	"Location": sObj.BinLocationCode
					}],
					"DocumentLinesBinAllocations": [{
						"BinAbsEntry": Number(absEntry),
						"Quantity": sObj.Quantity,
						"SerialAndBatchNumbersBaseLine": 0
					}]
				});
				batchUrl.push({
					url: "/b1s/v2/InventoryGenExits",
					data: payLoadInventoryExit,
					method: "POST"
				});
				var payLoadInventoryEntry = {
					"BPL_IDAssignedToInvoice": jsonModel.getProperty("/sLinObj").U_Branch,
					//	"PaymentGroupCode": 2,
					"Comments": "Immature plants - Change strain",
					"DocumentLines": []
				};
				payLoadInventoryEntry.DocumentLines.push({
					"BaseType": 202,
					"BaseEntry": docNUM,
					//	"ItemCode": entryItemcode, //sObj.newItemCode,
					// "ItmGrpCode": 100,
					"WarehouseCode": sObj.WhsCode,
					"Quantity": sObj.Quantity,
					// "CostingCode": costingCode,
					//	"UnitPrice": Number(ProdStdCost),
					"BatchNumbers": [{
						"BatchNumber": sObj.BatchNum, // <THIS IS TAG>
						"Quantity": sObj.Quantity, //<THIS IS THE QTY OF CLONES>
						"Location": sObj.BinLocationCode, //<THIS IS FROM CLONE ROOM>
						"ManufacturerSerialNumber": sObj.MnfSerial,
						"U_LotNumber": sObj.U_LotNumber,
						"U_BatAttr3": sObj.SourceUID,
						"U_Phase": sObj.U_Phase,
						"U_IsPackage": "NO"
					}],
					"DocumentLinesBinAllocations": [{
						"BinAbsEntry": Number(absEntry),
						"Quantity": sObj.Quantity,
						"SerialAndBatchNumbersBaseLine": 0
					}]
				});
				batchUrl.push({
					url: "/b1s/v2/InventoryGenEntries",
					data: payLoadInventoryEntry,
					method: "POST"
				});

				var secondPatchCall = {
					"ProductionOrderStatus": "boposClosed",
				};

				batchUrl.push({
					url: "/b1s/v2/ProductionOrders(" + Number(docNUM) + ")",
					data: secondPatchCall,
					method: "PATCH"
				});
				jsonModel.setProperty("/errorTxt", []);
				this.createBatchCall(batchUrl, function () {
					sap.m.MessageToast.show("Strain Name changed succsessfully");
					that.byId("clonePlannerTable").setSelectedIndex(-1);
					that.changeItemMETRCDialog.close();
					that.loadMasterData();
					jsonModel.setProperty("/changeStrainsSelect", false);
					jsonModel.setProperty("/busyTitle", "✅ All set!");
					jsonModel.setProperty("/busyText", "Strain change completed successfully");
					setTimeout(function () {
						that._busyDialog.close();
					}, 1000);
				});

			}.bind(that), payLoadProduction, "POST");

		},

		/**** change strain ends ****/

		/**** Edit harvest name starts ****/

		handleEditHarvestName: function () {
			var jsonModel = this.getOwnerComponent().getModel("jsonModel");
			var sItems;
			var table = this.getView().byId("clonePlannerTable");
			sItems = table.getSelectedIndices();
			var Arry = [];
			if (sItems.length > 0) {
				if (!this.editHarvestNameDialog) {
					this.editHarvestNameDialog = sap.ui.xmlfragment("editHarvestName", "com.9b.clonePlanner2.view.fragments.EditHarvestName",
						this);
					this.getView().addDependent(this.editHarvestNameDialog);
				}

				this.editHarvestNameDialog.open();
				var batches = [];
				$.each(sItems, function (i, e) {
					var updateObject;
					updateObject = table.getContextByIndex(e).getObject();
					updateObject.HARVESTNAME = "";
					updateObject.SNO = "#" + (i + 1);
					Arry.push(updateObject);
				});

				jsonModel.setProperty("/editHarvestNameData", Arry);

			} else {
				sap.m.MessageToast.show("Please select a batch");
			}
		},

		onUpdateEditHarvestName: function () {
			var jsonModel = this.getOwnerComponent().getModel("jsonModel");
			var tableData = jsonModel.getProperty("/editHarvestNameData");
			var isValidate = true;
			var that = this;
			$.each(tableData, function (i, obj) {
				if (obj.HARVESTNAME == "") {
					sap.m.MessageToast.show("Please enter harvest name");
					isValidate = false;
				}
			});

			if (isValidate) {
				var batchUrl = [];
				this.editHarvestNameDialog.setBusy(true);
				that.readServiecLayer("/b1s/v2/UsersService_GetCurrentUser", function (resP) {
					$.each(tableData, function (i, sObj) {
						var object = {
							BatchAttribute1: sObj.HARVESTNAME,
						};
						batchUrl.push({
							url: "/b1s/v2/BatchNumberDetails(" + sObj.BatchAbsEntry + ")",
							data: object,
							method: "PATCH"
						});
					});
					that.editHarvestNameDialog.setBusy(true);
					that.createBatchCall(batchUrl, function () {
						sap.m.MessageToast.show("Harvest name updated successfully");
						that.editHarvestNameDialog.setBusy(false);
						that.editHarvestNameDialog.close();
						that.byId("clonePlannerTable").setSelectedIndex(-1);
						that.byId("clonePlannerTable").clearSelection();
						that.loadMasterData();
					});
				});

			}

		},

		onCloseEditHarvestName: function () {
			this.editHarvestNameDialog.close();
		},

		/**** Edit harvest name ends ****/

		/**** Edit lot Number starts ****/

		onLotNumTemApply: function () {
			var jsonModel = this.getOwnerComponent().getModel("jsonModel");
			var getMainLOTNAME = jsonModel.getProperty("/MainLOTNAME");
			var geteditlotNameData = jsonModel.getProperty("/editlotNameData");
			$.each(geteditlotNameData, function (i, m) {
				m.LOTNAME = getMainLOTNAME;
			});
			jsonModel.setProperty("/editlotNameData", geteditlotNameData);
		},

		handleEditLotNumber: function () {
			var jsonModel = this.getOwnerComponent().getModel("jsonModel");
			jsonModel.setProperty("/MainLOTNAME", "");
			var sItems;
			var table = this.getView().byId("clonePlannerTable");
			sItems = table.getSelectedIndices();
			var Arry = [];
			if (sItems.length > 0) {
				if (!this.editLotNameDialog) {
					this.editLotNameDialog = sap.ui.xmlfragment("editLotNumber", "com.9b.clonePlanner2.view.fragments.EditLotNumber",
						this);
					this.getView().addDependent(this.editLotNameDialog);
				}

				this.editLotNameDialog.open();
				var batches = [];
				$.each(sItems, function (i, e) {
					var updateObject;
					updateObject = table.getContextByIndex(e).getObject();
					if (updateObject.U_LotNumber == null) {
						updateObject.LOTNAME = "";
					} else {
						updateObject.LOTNAME = updateObject.U_LotNumber;
					}
					updateObject.SNO = "#" + (i + 1);
					Arry.push(updateObject);
				});

				jsonModel.setProperty("/editlotNameData", Arry);

			} else {
				sap.m.MessageToast.show("Please select a batch");
			}
		},

		onUpdateEditLotNumber: function () {
			var jsonModel = this.getOwnerComponent().getModel("jsonModel");
			var tableData = jsonModel.getProperty("/editlotNameData");
			var isValidate = true;
			var that = this;
			$.each(tableData, function (i, obj) {
				if (obj.LOTNAME == "") {
					sap.m.MessageToast.show("Please enter lot number");
					isValidate = false;
				}
			});

			if (isValidate) {
				var batchUrl = [];
				that.editLotNameDialog.setBusy(true);
				that.readServiecLayer("/b1s/v2/UsersService_GetCurrentUser", function (resP) {
					$.each(tableData, function (i, sObj) {
						var object = {
							U_LotNumber: sObj.LOTNAME,
						};
						batchUrl.push({
							url: "/b1s/v2/BatchNumberDetails(" + sObj.BatchAbsEntry + ")",
							data: object,
							method: "PATCH"
						});
					});
					that.editLotNameDialog.setBusy(true);
					that.createBatchCall(batchUrl, function () {
						sap.m.MessageToast.show("Lot number updated successfully");
						that.editLotNameDialog.setBusy(false);
						that.editLotNameDialog.close();
						that.byId("clonePlannerTable").setSelectedIndex(-1);
						that.byId("clonePlannerTable").clearSelection();
						that.loadMasterData();
					});
				});

			}

		},

		onCloseEditLotNumber: function () {
			this.editLotNameDialog.close();
		},

		/**** Edit lot Number ends ****/

		/*method used for Record waste start*/
		handleonRecordWaste: function () {
			var jsonModel = this.getOwnerComponent().getModel("jsonModel");
			jsonModel.setProperty("/enableWaste", true);
			var sItems;
			var clonePlannerTable = this.getView().byId("clonePlannerTable");
			var updateObject;
			var dateFormat = sap.ui.core.format.DateFormat.getDateInstance({
				pattern: 'MM-dd-yyyy'
			});
			var newdateT = dateFormat.format(new Date());
			sItems = clonePlannerTable.getSelectedIndices();
			if (sItems.length === 0) {
				sap.m.MessageToast.show("Please select atleast one batch");
				return;
			}
			if (sItems.length > 0) {
				if (!this.reportWasteDialog) {
					this.reportWasteDialog = sap.ui.xmlfragment("rWaste", "com.9b.clonePlanner2.view.fragments.ReportWaste", this);
					this.getView().addDependent(this.reportWasteDialog);
				}
				this.reportWasteDialog.open();
				var sArrayObj = [];
				var selObj;
				$.each(sItems, function (i, e) {
					selObj = clonePlannerTable.getContextByIndex(e).getObject();
					var METRCLocCalls;
					if (selObj.ItemName.includes("Clone") == true || selObj.ItemName.includes("Seed") == true) {
						METRCLocCalls = "CLONE";
					} else {
						METRCLocCalls = "TEEN";
					}
					selObj.sLocation = "";
					selObj.METRCLocCall = METRCLocCalls;
					selObj.U_NWTMT = "";
					selObj.U_NWTWT = "";
					selObj.U_NRSON = "";
					selObj.wasteWt = "";
					selObj.SNO = "#" + (i + 1);
					selObj.wasteUOM = "";
					selObj.U_NMTUS = "";
					selObj.U_NNOTE = "";
					selObj.U_NCRDT = new Date();
					sArrayObj.push(selObj);
				});
				jsonModel.setProperty("/recordWasteData", sArrayObj);
				jsonModel.setProperty("/temLocation", "");
				jsonModel.setProperty("/temWasteMethod", "");
				jsonModel.setProperty("/temMaterialUsed", "");
				jsonModel.setProperty("/temReson", "");
				jsonModel.setProperty("/temNotes", "");
				jsonModel.setProperty("/temDestroyDate", new Date());
				this.loadWasteMethodData();
				this.loadWasteResonData();
			}
		},
		loadWasteMethodData: function () {
			var jsonModel = this.getOwnerComponent().getModel("jsonModel");
			var wSelect = "?$select=Name";
			this.getView().setBusy(true);
			this.readServiecLayer("/b1s/v2/U_NWMET" + wSelect, function (data) {
				this.getView().setBusy(false);
				jsonModel.setProperty("/WasteMethodsList", data.value);
			});
		},
		loadWasteResonData: function () {
			var jsonModel = this.getOwnerComponent().getModel("jsonModel");
			var rSelect = "?$select=Name";
			this.getView().setBusy(true);
			this.readServiecLayer("/b1s/v2/U_NWREA" + rSelect, function (data) {
				this.getView().setBusy(false);
				jsonModel.setProperty("/WasteReasonsList", data.value);
			});
		},
		closeReportWaste: function () {
			this.reportWasteDialog.close();
		},
		onRecordWasteDelete: function (evt) {
			var jsonModel = this.getView().getModel("jsonModel");
			var recordWasteData = jsonModel.getProperty("/recordWasteData");
			var sIndex = evt.getSource().getParent().getParent().indexOfItem(evt.getSource().getParent());
			recordWasteData.splice(sIndex, 1);
			jsonModel.setProperty("/recordWasteData", recordWasteData);
		},
		confirmRecordWaste: function () {
			var jsonModel = this.getOwnerComponent().getModel("jsonModel");
			jsonModel.setProperty("/enableWaste", false);
			var licenseNo = jsonModel.getProperty("/selectedLicense");
			var recordWasteData = jsonModel.getProperty("/recordWasteData");
			var vegetationTable = this.getView().byId("vegetationTable");
			var metrcData = jsonModel.getProperty("/metrcData");
			var ItemList = jsonModel.getProperty("/allItemList");

			var that = this;
			var isValidated = true;
			var errorMsg = [];
			$.each(recordWasteData, function (i, sObj) {
				if (sObj.U_NWTWT === "") {
					isValidated = false;
					errorMsg.push("Please enter waste weight");
					jsonModel.setProperty("/enableWaste", true);
					return;
				} else if (sObj.U_NWTMT === "") {
					isValidated = false;
					errorMsg.push("Please select waste method");
					jsonModel.setProperty("/enableWaste", true);
					return;
				} else if (sObj.U_NMTUS === "") {
					isValidated = false;
					errorMsg.push("Please enter material used");
					jsonModel.setProperty("/enableWaste", true);
					return;
				} else if (sObj.U_NRSON === "") {
					isValidated = false;
					errorMsg.push("Please select reason");
					jsonModel.setProperty("/enableWaste", true);
					return;
				} else if (sObj.U_NNOTE === "") {
					isValidated = false;
					errorMsg.push("Please enter notes");
					jsonModel.setProperty("/enableWaste", true);
					return;
				} else if (sObj.U_NCRDT === "") {
					isValidated = false;
					errorMsg.push("Please enter waste record date");
					jsonModel.setProperty("/enableWaste", true);
					return;
				}
			});
			errorMsg = this.removeDuplicates(errorMsg);
			if (!isValidated) {
				sap.m.MessageToast.show(errorMsg.join("\n"));
				return;
			}
			var batchUrl = [],
				metricPayload = [],
				metrcclonePayLoad = [],
				InventoryUOM = "",
				payLoadCreate, locationName, cDate;
			$.each(recordWasteData, function (i, sObj) {
				locationName = sObj.U_MetrcLocation;
				cDate = that.getSystemDate(sObj.U_NCRDT);
				payLoadCreate = {
					U_NLCNM: sObj.BinLocationCode,
					U_NPBID: sObj.BatchNum,
					U_NWTMT: sObj.U_NWTMT,
					U_NMTUS: sObj.U_NMTUS,
					U_NWTWT: Number(sObj.U_NWTWT).toFixed(2),
					U_NWTUM: "Pounds",
					U_NWTRS: sObj.U_NRSON,
					U_NNOTE: sObj.U_NNOTE,
					U_NCRDT: that.getSystemDate(sObj.U_NCRDT),
					U_NLUDT: that.getSystemDate(new Date()), //last updated date
					U_NLFID: licenseNo //license name
				};
				batchUrl.push({
					url: "/b1s/v2/NWTHS",
					data: payLoadCreate,
					method: "POST"
				});

				$.each(ItemList, function (j, k) {
					if (k.ItemName && sObj.ItemName && k.ItemName == sObj.ItemName) {
						InventoryUOM = k.InventoryUOM;
						return false;
					}
				});

				if (metrcData && metrcData.U_NACST === "X") {

					if (sObj.METRCLocCall == "TEEN") {
						var metricObj = {
							WasteMethodName: sObj.U_NWTMT,
							MixedMaterial: sObj.U_NMTUS,
							WasteWeight: sObj.U_NWTWT,
							UnitOfMeasureName: InventoryUOM,
							ReasonName: sObj.U_NRSON,
							Note: sObj.U_NNOTE,
							WasteDate: that.getSystemDate(sObj.U_NCRDT),
							PlantBatchName: sObj.BatchNum
						};
						metricPayload.push(metricObj);
					} else {

						var metrcclonePayLoadObj = {
							Label: sObj.BatchNum,
							Quantity: -Number(sObj.U_NWTWT),
							UnitOfMeasure: InventoryUOM,
							AdjustmentReason: "Waste (Unusable Product)",
							AdjustmentDate: that.getSystemDate(),
							ReasonNote: "Immature plants - record waste button (adjust)"
						};
						metrcclonePayLoad.push(metrcclonePayLoadObj);
					}

				}
			});
			that.readServiecLayer("/b1s/v2/UsersService_GetCurrentUser", function (resP) {
				if (metrcData && metrcData.U_NACST === "X") {
					jsonModel.setProperty("/busyView", true);
					if (metricPayload.length > 0) {
						var metrcUrl = "/plantbatches/v2/waste/?licenseNumber=" + jsonModel.getProperty("/selectedLicense");
						that.callMetricsService(metrcUrl, "POST", metricPayload, function () {
							sap.m.MessageToast.show("METRC sync completed successfully");
							that.recordWasteDataToTable(batchUrl);
						}, function (error) {
							sap.m.MessageToast.show(JSON.stringify(error));
							jsonModel.setProperty("/busyView", false);
							jsonModel.setProperty("/enableWaste", true);
						});
					}

				} else {
					that.recordWasteDataToTable(batchUrl);
				}
			});
		},
		recordWasteDataToTable: function (batchUrl) {
			var jsonModel = this.getOwnerComponent().getModel("jsonModel");
			var that = this;
			jsonModel.setProperty("/errorTxt", []);
			this.createBatchCall(batchUrl, function () {
				var errorTxt = jsonModel.getProperty("/errorTxt");
				if (errorTxt.length > 0) {
					jsonModel.setProperty("/busyView", false);
					jsonModel.setProperty("/enableWaste", true);
					sap.m.MessageBox.error(errorTxt.join("\n"));
				}
				jsonModel.setProperty("/busyView", false);
				jsonModel.setProperty("/enableWaste", true);
				that.reportWasteDialog.close();
				sap.m.MessageToast.show("Record waste completed succsessfully");
				that.byId("clonePlannerTable").setSelectedIndex(-1);
				that.loadMasterData();
			});
		},
		/*method used for Record waste end*/

		/*Methods for multiInput for sarch field for scan functionality start*/
		fillFilterLoad: function (elementC, removedText) {
			var orFilter = [];
			var andFilter = [];
			$.each(elementC.getTokens(), function (i, info) {
				var value = info.getText();
				if (value !== removedText) {
					orFilter.push(new sap.ui.model.Filter("BatchNum", "Contains", value.toLowerCase()));
					orFilter.push(new sap.ui.model.Filter("ItemName", "Contains", value.toLowerCase()));
					orFilter.push(new sap.ui.model.Filter("SourceUID", "Contains", value.toLowerCase()));
					orFilter.push(new sap.ui.model.Filter("MnfSerial", "Contains", value.toLowerCase()));
					orFilter.push(new sap.ui.model.Filter("WhsName", "Contains", value.toLowerCase()));
					orFilter.push(new sap.ui.model.Filter("U_LotNumber", "Contains", value.toLowerCase()));

					andFilter.push(new sap.ui.model.Filter({
						filters: orFilter,
						and: false,
						caseSensitive: false
					}));
				}
			});
			this.byId("clonePlannerTable").getBinding("rows").filter(andFilter);
		},

		renderComplete: function (evt) {
			if (evt.getSource().getParent().getParent().getFullScreen() === false) {
				evt.getSource().setHeight("8rem");
			}
		},

		onFilterTable: function (evt) {
			var customData = evt.getParameter("column").getLabel().getCustomData();
			if (customData.length > 0 && customData[0].getKey() === "DAYS") {
				var sValue = evt.getParameter("value");
				var filters = [new sap.ui.model.Filter("Quantity", "EQ", sValue)];
				this.byId("clonePlannerTable").getBinding("rows").filter(filters);
			}
		},

		onChangeReportWaste: function (evt) {
			var value = evt.getParameter("newValue");
			value = value.replace(/[^.\d]/g, '').replace(/^(\d*\.?)|(\d*)\.?/g, "$1$2");
			evt.getSource().setValue(value);
		},

		onChangeQuantityclone: function (evt) {
			// var sObj = evt.getSource().getBindingContext("jsonModel").getObject();
			// var aQty = sObj.Quantity;
			var value = evt.getParameter("value");
			value = value.replace(/[^.\d]/g, '').replace(/^(\d*\.?)|(\d*)\.?/g, "$1$2");
			evt.getSource().setValue(value);
			if (Number(value) === 0) {
				evt.getSource().setValueState("Error");
				evt.getSource().setValueStateText("Invalid quantity");
				evt.getSource().focus();
			} else {
				evt.getSource().setValueState("None");
			}
		},

		onRefreshChart: function () {
			this.byId("clonePlannerTable").setSelectedIndex(-1);
		},

		onSelectStrainChart: function (evt) {
			var filteredText = "";
			var index = evt.getParameter("data")[0].data["_context_row_number"];
			var selObj = {};
			if (evt.getSource().getModel()) {
				selObj = evt.getSource().getModel().getData()[index];
			} else {
				selObj = evt.getSource().getModel("jsonModel").getData().VegKPI[index];
			}
			var cloneTable, cloneList, combinedFilter1, combinedFilter2, filter, filters1 = [],
				filters2 = [];
			cloneTable = this.byId("clonePlannerTable");
			var that = this,
				combinedFilter = new Filter({
					filters: [],
					and: true
				});
			that.byId("searchFieldTable1").setText("");
			if (evt.getParameters().name === "selectData") {
				var obj = {
					FIELDNAME: selObj.FIELDNAME,
					LABEL: selObj.LABEL
				};
				that.combinedFilter.push(obj);
			} else {
				if (evt.getParameter("data") && evt.getParameter("data").length > 1) {
					var fieldName = selObj.FIELDNAME;
					var labelName = evt.getSource().getDataset().getDimensions()[0].getName();
					selObj = evt.getParameter("data");
				}
				var tempComFilter = $.extend(true, [], this.combinedFilter);
				$.each(tempComFilter, function (i, e) {
					if (selObj.length) {
						selObj.forEach(function (info) {
							if (fieldName && e.FIELDNAME === fieldName && e.LABEL === info.data[labelName]) {
								e.removed = true;
							}
						});
					} else if (selObj.FIELDNAME && e.FIELDNAME === selObj.FIELDNAME && e.LABEL === selObj.LABEL) {
						e.removed = true;
					}
				});
			}
			if (tempComFilter) {
				this.combinedFilter = [];
				tempComFilter.forEach(function (info) {
					if (!info.removed) {
						that.combinedFilter.push(info);
					}
				});
			}

			var filterText = "";
			$.each(this.combinedFilter, function (i, e) {
				filter = new Filter(e.FIELDNAME, FilterOperator.EQ, e.LABEL, false);
				var token = new sap.m.Token({
					key: e.LABEL,
					text: e.LABEL
				});
				filterText += " " + e.LABEL + " ,";
				if (e.FIELDNAME === "U_NSTNM") {
					filters1.push(filter);
				} else {
					filters2.push(filter);
				}
			});
			if (filters1 && filters1.length > 0) {
				combinedFilter1 = new Filter({
					filters: filters1,
					and: false
				});
				combinedFilter.aFilters.push(combinedFilter1);
			}
			if (filters2 && filters2.length > 0) {
				combinedFilter2 = new Filter({
					filters: filters2,
					and: false
				});
				combinedFilter.aFilters.push(combinedFilter2);
			}
			cloneTable.getBinding("rows").filter([combinedFilter]);
			filterText = filterText.substr(0, filterText.length - 1);
			var clonePlannerTable = this.byId("clonePlannerTable");
			var count = clonePlannerTable.getBinding("rows").iLength;
			var totalCount = clonePlannerTable.getBinding("rows").oList.length;
			this.byId("tableHeader").setText("Items (" + count + "/" + totalCount + ")");
		},

		handleCreatePlantings: function () {
			var jsonModel = this.getOwnerComponent().getModel("jsonModel");
			jsonModel.setProperty("/enableCreate", true);
			if (!this.createPlantingDialog) {
				this.createPlantingDialog = sap.ui.xmlfragment("createPlantings", "com.9b.clonePlanner2.view.fragments.CreatePlantings", this);
				this.getView().addDependent(this.createPlantingDialog);
			}
			sap.ui.core.Fragment.byId("createPlantings", "createPlantingSearchID").setValue("");
			this.clearCreatePlantsData();
			this.createPlantingDialog.open();
			this.loadRequiredDataForPlantingsPackage();
			this.loadMetrcTags();
			this.loadCloneItems();
		},

		clearCreatePlantsData: function () {
			var jsonModel = this.getOwnerComponent().getModel("jsonModel");
			var selectedBinCode = jsonModel.getProperty("/selectedBinCode");
			var selectedWarehouse = jsonModel.getProperty("/selectedWarehouse");
			var selectedAbsEntry = jsonModel.getProperty("/selectedAbsEntry");
			var selKey = selectedWarehouse + "-" + selectedAbsEntry + "-" + selectedBinCode;
			var cPlantingsData = {
				sPackage: "",
				mUID: "",
				hTag: "",
				sQty: "",
				itemName: "",
				itemCode: "",
				ProdStdCost: "",
				fromLoc: "",
				toLoc: selKey,
				//PhasePackage: "",
				sDate: new Date()
			};
			jsonModel.setProperty("/cPlantingsData", cPlantingsData);
		},
		handleCreatePlantingsFromPackage: function () {
			var jsonModel = this.getOwnerComponent().getModel("jsonModel");
			if (!this.createPlantingPackageDialog) {
				this.createPlantingPackageDialog = sap.ui.xmlfragment("createPlantingsPackage",
					"com.9b.clonePlanner2.view.fragments.CreatePlantingsFromPackage", this);
				this.getView().addDependent(this.createPlantingPackageDialog);
			}
			this.clearCreatePlantsData();
			this.createPlantingPackageDialog.open();
			this.loadRequiredDataForPlantingsPackage();
			this.loadMetrcTags();
			this.loadCloneItems();
		},
		onCreatePlantsPackageClose: function () {
			this.createPlantingPackageDialog.close();
		},
		loadRequiredDataForPlantingsPackage: function () {
			var jsonModel = this.getOwnerComponent().getModel("jsonModel");
			var licenseNo = jsonModel.getProperty("/selectedLicense");
			var filters = "?$filter=U_MetrcLicense eq " + "'" + licenseNo +
				"' and Quantity ne 0 and U_Phase eq 'Package' and (endswith(ItemName,'Teen') or contains(ItemName,'Clone'))";
			jsonModel.setProperty("/ComboBoxBusy", true);
			this.readServiecLayer("/b1s/v2/sml.svc/CV_GH_BATCHQUERY_VW" + filters, function (packageData) {
				jsonModel.setProperty("/ComboBoxBusy", false);
				jsonModel.setProperty("/packageData", packageData.value);
			});
		},
		loadRequiredDataForPlantings: function () {
			var jsonModel = this.getOwnerComponent().getModel("jsonModel");
			var licenseNo = jsonModel.getProperty("/selectedLicense");
			var filters = "?$filter=U_MetrcLicense eq " + "'" + licenseNo +
				"' and U_Phase eq 'Mother' and (endswith(ItemName,'Immature Plant') or contains(ItemName,'Clone'))";
			jsonModel.setProperty("/ComboBoxBusy", true);
			this.readServiecLayer("/b1s/v2/sml.svc/CV_GH_BATCHQUERY_VW" + filters, function (packageData) {
				jsonModel.setProperty("/ComboBoxBusy", false);
				jsonModel.setProperty("/packageData", packageData.value);
			});
		},

		onSearchCreateplantingsSource: function (evt) {
			var oItem = evt.getParameter("suggestionItem");
			var jsonModel = this.getOwnerComponent().getModel("jsonModel");
			if (oItem) {
				var sObj = oItem.getBindingContext("jsonModel").getObject();
				// var sItem = evt.getParameters().newValue.split("-")[0];
				// var sObj = sItem.getBindingContext("jsonModel").getObject();
				var packageData = jsonModel.getProperty("/packageData");
				var cPlantingsData = jsonModel.getProperty("/cPlantingsData");
				//calculate auto harvest name
				var date = new Date();
				var oDateFormat = DateFormat.getDateInstance({
					pattern: "MMddyyyyHHmmss"
				});
				// var StrainName = evt.getParameters().newValue.split("-")[1];
				var formattedDate = oDateFormat.format(date);
				var harvestName = sObj.StrainName.substring(0, 4) + formattedDate;

				cPlantingsData.sQty = sObj.Quantity;
				cPlantingsData.fromLoc = sObj.WhsCode;
				cPlantingsData.BinLocationCode = sObj.BinLocationCode;
				cPlantingsData.itemName = sObj.ItemName;
				cPlantingsData.itemCode = sObj.ItemCode;
				cPlantingsData.hTag = harvestName;
				cPlantingsData.sPackage = sObj.METRCUID;
				jsonModel.setProperty("/cPlantingsData", cPlantingsData);
				this.loadSelectedItemCall(sObj.ItemCode);

			} else if (evt.getParameter("clearButtonPressed")) {
				evt.getSource().fireSuggest();

			}
		},

		onSuggestCreateplantingsSource: function (event) {
			this.oSF = sap.ui.core.Fragment.byId("createPlantings", "createPlantingSearchID");
			var sValue = event.getParameter("suggestValue");
			var aFilters = [];

			if (sValue) {
				// Convert sValue to number if possible
				var iValue = parseFloat(sValue);
				var isNumber = !isNaN(iValue);
				var dateValue = new Date(sValue);
				var isDate = !isNaN(dateValue.getTime());

				aFilters = [
					new Filter([
						new Filter("METRCUID", function (sText) {
							return (sText || "").toUpperCase().indexOf(sValue.toUpperCase()) > -1;
						}),
						new Filter("ItemName", function (sDes) {
							return (sDes || "").toUpperCase().indexOf(sValue.toUpperCase()) > -1;
						}),
						new Filter("Quantity", function (sText) {
							return isNumber && sText === iValue;
						}),
						new Filter("CreateDate", function (sText) {
							if (isDate) {
								return (sText || "").indexOf(sValue) > -1;
							}
							return false;
						})
					], false)
				];
			}

			this.oSF.getBinding("suggestionItems").filter(aFilters);
			this.oSF.suggest();
		},

		confirmCreatePlantings: function () {
			var that = this;
			var jsonModel = this.getOwnerComponent().getModel("jsonModel");
			jsonModel.setProperty("/enableCreate", false);
			var licenseNo = jsonModel.getProperty("/selectedLicense");
			var cPlantingsData = jsonModel.getProperty("/cPlantingsData");
			var ChangeLocationList = jsonModel.getProperty("/ChangeLocationList");
			// var ItemList = jsonModel.getProperty("/allItemList");
			var ItemList = jsonModel.getProperty("/selectedItemCall");
			var cDate = cPlantingsData.sDate;
			var sourceTag = cPlantingsData.sPackage;
			var BatchNumber = cPlantingsData.mUID;
			var harvestTag = cPlantingsData.hTag;
			var qty = cPlantingsData.sQty;
			var itemCode = cPlantingsData.itemCode;
			var itemName = cPlantingsData.itemName;
			// var ProdStdCost = cPlantingsData.ProdStdCost;
			var fromLoc = cPlantingsData.fromLoc;
			var toLoc = cPlantingsData.toLoc;
			var dateFormat = DateFormat.getDateInstance({
				pattern: "yyyy-MM-dd"
			});
			var cDatebatch = dateFormat.format(cDate);
			//var PhasePackage = cPlantingsData.PhasePackage;
			qty = Number(qty);
			if (!sourceTag) {
				sap.m.MessageToast.show("Please select package");
				jsonModel.setProperty("/enableCreate", true);
				return;
			} else if (!BatchNumber) {
				sap.m.MessageToast.show("Please select METRC UID");
				jsonModel.setProperty("/enableCreate", true);
				return;
			} else if (!harvestTag) {
				sap.m.MessageToast.show("Please enter harvest name");
				jsonModel.setProperty("/enableCreate", true);
				return;
			} else if (!cDate) {
				sap.m.MessageToast.show("Please select date");
				jsonModel.setProperty("/enableCreate", true);
				return;
			} else if (toLoc === "") {
				sap.m.MessageToast.show("Please select location");
				jsonModel.setProperty("/enableCreate", true);
				return;
			}
			if (cDate !== null) {
				cDate = this.getSystemDate(cDate);
			} else {
				cDate = this.getSystemDate(new Date());
			}
			var AbslocationEntry, BinCode, ProdStdCost, locationName;

			var rObj = $.grep(ChangeLocationList, function (sLoc) {
				if (sLoc.BinCode === toLoc.replace(toLoc.split("-")[0], "").replace("-", "").replace(toLoc.split("-")[1], "")
					.replace("-", "")) {
					return sLoc;
				}
			});
			locationName = rObj[0].U_MetrcLocation;
			$.each(ChangeLocationList, function (i, obj) {
				if (obj.BinCode && cPlantingsData.BinLocationCode.toLowerCase() == obj.BinCode.toLowerCase()) {
					AbslocationEntry = obj.AbsEntry;
					BinCode = obj.BinCode;
				}
			});
			$.each(ItemList, function (j, k) {
				if (k.ItemName && itemName && (k.ItemName == itemName)) {
					ProdStdCost = k.ProdStdCost;
					return false;
				}
			});
			var payLoadInventoryEntry = {
				"BPL_IDAssignedToInvoice": jsonModel.getProperty("/sLinObj").U_Branch,
				"Comments": "Immature Plants – Create Plantings",
				"DocDate": cDatebatch,
				"DocumentLines": []
			};
			payLoadInventoryEntry.DocumentLines.push({
				"ItemCode": itemCode, //<THIS IS SELECTED ITEM> 
				"WarehouseCode": toLoc.split("-")[0], // <THIS IS FROM CLONE ROOM>
				"Quantity": qty, // <THIS IS THE QTY OF CLONES>
				"UnitPrice": ProdStdCost,
				"CostingCode": "NURS",
				"BatchNumbers": [{
					"AddmisionDate": cDatebatch,
					"BatchNumber": BatchNumber, // <THIS IS TAG>
					"Quantity": qty, //<THIS IS THE QTY OF CLONES>
					"Location": toLoc.replace(toLoc.split("-")[0], "").replace("-", "").replace(toLoc.split("-")[1], "").replace("-", ""),
					"U_BatAttr3": sourceTag,
					"ManufacturerSerialNumber": harvestTag,
					"U_IsPackage": "NO",
					"U_Phase": "Immature"
				}],
				"DocumentLinesBinAllocations": [{
					"BinAbsEntry": Number(toLoc.split("-")[1]),
					"Quantity": qty,
					"SerialAndBatchNumbersBaseLine": 0
				}]
			});
			var payLoadInventoryExit = {
				"BPL_IDAssignedToInvoice": jsonModel.getProperty("/sLinObj").U_Branch,
				"Comments": "Immature Plants – Create Plantings",
				"DocDate": cDatebatch,
				"DocumentLines": []
			};
			payLoadInventoryExit.DocumentLines.push({
				"ItemCode": itemCode, //<THIS IS SELECTED ITEM> 
				"WarehouseCode": fromLoc.split("-")[0], // <THIS IS FROM CLONE ROOM>
				"Quantity": qty, // <THIS IS THE QTY OF CLONES>
				"CostingCode": "NURS",
				"BatchNumbers": [{
					"AddmisionDate": cDatebatch,
					"BatchNumber": sourceTag, // <THIS IS TAG>
					"Quantity": qty, //<THIS IS THE QTY OF CLONES>
					"Location": BinCode, //fromLoc //<THIS IS FROM CLONE ROOM>
				}],
				"DocumentLinesBinAllocations": [{
					"BinAbsEntry": Number(AbslocationEntry),
					"Quantity": qty,
					"SerialAndBatchNumbersBaseLine": 0
				}]
			});
			var strainName = itemName.substring(0, itemName.lastIndexOf("-")).trim();
			// var locationName = sap.ui.core.Fragment.byId("createPlantings", "location").getSelectedItem().getText();
			var metrcData = jsonModel.getProperty("/metrcData");
			that.readServiecLayer("/b1s/v2/UsersService_GetCurrentUser", function (resP) {
				if (metrcData && metrcData.U_NACST === "X") {
					var metricPayload, metrcUrl;
					metrcUrl = "/packages/v2/plantings?licenseNumber=" + licenseNo;
					metricPayload = [{
						PackageLabel: sourceTag,
						PackageAdjustmentUnitOfMeasureName: "Each",
						PlantBatchName: BatchNumber,
						PlantBatchType: "Clone",
						PlantCount: qty,
						LocationName: locationName,
						StrainName: strainName,
						PlantedDate: cDatebatch, //that.getSystemDate(),
						UnpackagedDate: cDatebatch //that.getSystemDate()
					}];
					//that.createPlantingDialog.setBusy(true);
					this._busyDialog.open();
					jsonModel.setProperty("/busyTitle", "Hang tight...");
					jsonModel.setProperty(
						"/busyText",
						"We’re working on Create Plantings. Please keep this page open until we’re done."
					);
					that.callMetricsService(metrcUrl, "POST", metricPayload, function () {
						sap.m.MessageToast.show("METRC sync completed successfully");
						that.createPlantingsToTable(payLoadInventoryEntry, payLoadInventoryExit);
					}, function (error) {
						sap.m.MessageToast.show(JSON.stringify(error));
						that._busyDialog.close();
						jsonModel.setProperty("/enableCreate", true);
						//that.createPlantingDialog.setBusy(false);
					});
				} else {
					that.createPlantingsToTable(payLoadInventoryEntry, payLoadInventoryExit);
				}
			});
		},
		createPlantingsToTable: function (payLoadInventoryEntry, payLoadInventoryExit) {
			var that = this;
			var jsonModel = this.getOwnerComponent().getModel("jsonModel");
			//that.createPlantingDialog.setBusy(true);
			that.updateServiecLayer("/b1s/v2/InventoryGenEntries", function () {
				that.updateServiecLayer("/b1s/v2/InventoryGenExits", function (responseSL) {
					//that.createPlantingDialog.setBusy(false);
					jsonModel.setProperty("/busyView", false);
					jsonModel.setProperty("/enableCreate", true);
					that.loadMasterData();
					that.createPlantingDialog.close();
					jsonModel.setProperty("/busyTitle", "✅ All set!");
					jsonModel.setProperty("/busyText", "Plantings created successfully.");
					setTimeout(function () {
						that._busyDialog.close();
					}, 1000);
				}.bind(that), payLoadInventoryExit, "POST", that.createPlantingDialog);
			}.bind(that), payLoadInventoryEntry, "POST", that.createPlantingDialog);
		},
		onCreatePlantsClose: function () {
			this.createPlantingDialog.close();
		},

		onCloseRefreshChart: function () {
			this.byId("searchFieldTable1").setText("");
			this.byId("searchFieldTable2").setVisible(false);
			var cloneTable = this.byId("clonePlannerTable");
			cloneTable.getBinding("rows").filter([]);
			this.combinedFilter = [];
			this.byId("idVizFrame1").vizSelection([], {
				"clearSelection": true
			});
			/*	this.byId("idVizFrame2").vizSelection([], {
					"clearSelection": true
				});*/
		},

		relIssuePress: function (evt) {
			this.getOwnerComponent().navTo("ProView");
		},

		navToVegRoom: function () {
			this.getOwnerComponent().getRouter().navTo("Vegetation");
		},

		clearData: function () {
			var jsonModel = this.getOwnerComponent().getModel("jsonModel");
			this.byId("clonePlannerTable").clearSelection();
			jsonModel.setProperty("/isSingleSelect", false);
			//this.byId("releaseTo").setSelectedKey("");
			//this.byId("search").setValue();
		},

		/*code for clone create functionality start*/
		handlecreateClone: function () {
			if (!this.createCloneDialog) {
				this.createCloneDialog = sap.ui.xmlfragment("CloneCreateDialog", "com.9b.clonePlanner2.view.fragments.CreateClone", this);
				this.getView().addDependent(this.createCloneDialog);
			}
			sap.ui.core.Fragment.byId("CloneCreateDialog", "createCloneBtn").setEnabled(true);
			this.clearCreateCloneData();
			this.createCloneDialog.open();
			this.loadMetrcTags();
			this.loadCloneItems();
			this.loadLocationData();
		},
		loadLocationData: function () {
			var jsonModel = this.getOwnerComponent().getModel("jsonModel");
			var licenseNo = jsonModel.getProperty("/selectedLicense");
			// var filters = "?$filter=BarCode eq " + "'" + licenseNo + "'";
			var filters = "?$filter=U_MetrcLicense eq " + "'" + licenseNo + "' and not(startswith(Sublevel1,'SYSTEM'))";
			jsonModel.setProperty("/ComboBoxBusy", true);
			var fields = "&$select=" + ["U_MetrcLicense", "U_MetrcLocation", "Sublevel2", "BinCode", "AbsEntry", "Warehouse"].join();
			this.readServiecLayer("/b1s/v2/BinLocations" + filters + fields, function (data) {
				jsonModel.setProperty("/ComboBoxBusy", false);
				jsonModel.setProperty("/ChangeLocationList", data.value);
			});
		},
		/**method for clear form data while creating clone**/
		clearCreateCloneData: function () {
			var jsonModel = this.getOwnerComponent().getModel("jsonModel");
			var cCloneObj = {
				sCloneType: "MO",
				sMotherPlant: "",
				sDate: new Date(),
				sLocation: "",
				sQty: "",
				sStrain: "",
				pTag: "",
				sTag: "",
				hTag: "",
				sItem: ""
			};
			if (jsonModel.getProperty("/showSrc")) {
				//sap.ui.core.Fragment.byId("CloneCreateDialog", "source").setValue();
				//sap.ui.core.Fragment.byId("CloneCreateDialog", "sourceInput").setVisible(false);
			}
			jsonModel.setProperty("/cCloneData", cCloneObj);
		},

		itemSearchCreateclone: function (evt) {
			var that = this;
			var jsonModel = this.getOwnerComponent().getModel("jsonModel");
			var sObjItem = evt.getParameters().newValue.split("-")[0];

			if (sObjItem.endsWith(' ')) {
				sObjItem = sObjItem.slice(0, -1);
			}

			// jsonModel.getProperty("/selectedLicense");
			var licenseNo = jsonModel.getProperty("/selectedLicense");

			// var filters = "?$filter=U_MetrcLicense eq " + "'" + licenseNo +
			// 		"' and Quantity ne 0  and U_Phase eq 'Mother' and StrainName eq "+ sObjItem + "' and (endswith(ItemName,'Immature Plant') or endswith(ItemName,'Clone'))&$orderby=CreateDate desc,BatchNum desc";

			var filters = "?$filter=U_MetrcLicense eq '" + licenseNo +
				"' and Quantity ne 0 and U_Phase eq 'Mother' and StrainName eq '" + sObjItem +
				"' and Quantity eq 1 and endswith(ItemName, 'Cannabis Plant')&$orderby=CreateDate desc,BatchNum desc";

			sap.ui.core.Fragment.byId("CloneCreateDialog", "sourceTag").setBusy(true);
			this.readServiecLayer("/b1s/v2/sml.svc/CV_IMMATURE_PLANNER_VW" + filters, function (data) {
				sap.ui.core.Fragment.byId("CloneCreateDialog", "sourceTag").setBusy(false);

				jsonModel.setProperty("/sourceDataCreateclone", data.value);

			});

		},

		onCloneCreate: function () {
			var that = this;
			var jsonModel = this.getOwnerComponent().getModel("jsonModel");
			var licenseNo = jsonModel.getProperty("/selectedLicense");
			var cCloneData = jsonModel.getProperty("/cCloneData");
			var ChangeLocationList = jsonModel.getProperty("/ChangeLocationList");
			var date = jsonModel.getProperty("/cCloneData/sDate");
			var packageTag = sap.ui.core.Fragment.byId("CloneCreateDialog", "packageTag").getSelectedKey();
			var sourceTag = sap.ui.core.Fragment.byId("CloneCreateDialog", "sourceTag").getSelectedKey();
			var harvestTag = sap.ui.core.Fragment.byId("CloneCreateDialog", "harvestBatch").getValue();
			var quantity = sap.ui.core.Fragment.byId("CloneCreateDialog", "eQty").getValue();
			var valueState = sap.ui.core.Fragment.byId("CloneCreateDialog", "eQty").getValueState();
			var itemObj = sap.ui.core.Fragment.byId("CloneCreateDialog", "item");
			var itemCode = itemObj.getSelectedKey().split("-")[0];
			var ProdStdCost = itemObj.getSelectedKey().split("-")[1];
			var locationID = sap.ui.core.Fragment.byId("CloneCreateDialog", "location").getSelectedKey();
			if (valueState === "Error") {
				sap.ui.core.Fragment.byId("CloneCreateDialog", "eQty").focus();
				return;
			}
			var createdate = cCloneData.sDate;
			var qty = Number(cCloneData.sQty);
			if (qty === "" || qty === 0) {
				sap.m.MessageToast.show("Please enter quantity");
				return;
			}
			if (isNaN(qty)) {
				sap.m.MessageToast.show("Please enter numeric value only");
				return;
			}
			if (date === " " || date === null || date === undefined) {
				sap.m.MessageToast.show("Please select date");
				return;
			}
			if (locationID === "") {
				sap.m.MessageToast.show("Please select location");
				return;
			}
			var cloneData = jsonModel.getProperty("/allCloneData");
			var cDate;
			if (createdate !== null) {
				cDate = this.getSystemDate(createdate);
			} else {
				cDate = this.getSystemDate(new Date());
			}
			// var locationCode,AbslocationEntry;
			// var table = this.getView().byId("clonePlannerTable");
			// var sItems = table.getSelectedIndices();
			// var sObj = table.getContextByIndex(sItems).getObject();
			// 	$.each(ChangeLocationList, function(i,obj){
			// 		if(sObj.WhsName.toLowerCase() == obj.Sublevel2.toLowerCase()){
			// 			AbslocationEntry= obj.AbsEntry;
			// 			locationCode = obj.BinCode;
			// 		}
			// 	});

			var item = itemObj.getSelectedItem().getText();
			var itemName = itemObj.getSelectedItem().getBindingContext("jsonModel").getObject().ItemName;
			var strainName = itemName.substring(0, itemName.lastIndexOf("-")).trim();
			// var locationName = sap.ui.core.Fragment.byId("CloneCreateDialog", "location").getSelectedItem().getText();
			var BatchNumber = packageTag;
			var locationName = "";

			var rObj = $.grep(ChangeLocationList, function (sLoc) {
				if (sLoc.BinCode === locationID.replace(locationID.split("-")[0], "").replace("-", "").replace(locationID.split("-")[1], "")
					.replace("-", "")) {
					return sLoc;
				}
			});
			locationName = rObj[0].U_MetrcLocation;

			var payLoadInventory = {
				"BPL_IDAssignedToInvoice": jsonModel.getProperty("/sLinObj").U_Branch,
				"DocumentLines": []
			};
			payLoadInventory.DocumentLines.push({
				"ItemCode": itemCode, //<THIS IS SELECTED ITEM> 
				"WarehouseCode": locationID.split("-")[0], // <THIS IS FROM CLONE ROOM>
				"Quantity": qty, // <THIS IS THE QTY OF CLONES>
				"UnitPrice": Number(ProdStdCost),
				"BatchNumbers": [{
					"BatchNumber": BatchNumber, // <THIS IS TAG>
					"Quantity": qty, //<THIS IS THE QTY OF CLONES>
					"Location": locationID.replace(locationID.split("-")[0], "").replace("-", "").replace(locationID.split("-")[1], "").replace(
						"-", ""),
					//locationID.replace(locationID.split("-")[2],"").replace("-", ""), //<THIS IS FROM CLONE ROOM>
					"U_Phase": "Immature",
					"U_BatAttr3": sourceTag,
					"ManufacturerSerialNumber": harvestTag
				}],
				"DocumentLinesBinAllocations": [{
					"BinAbsEntry": Number(locationID.split("-")[1]),
					"Quantity": qty,
					"SerialAndBatchNumbersBaseLine": 0
				}]

			});
			var metrcData = jsonModel.getProperty("/metrcData");
			if (metrcData && metrcData.U_NACST === "X") {
				var metricPayload, metrcUrl;
				metrcUrl = "/plants/v2/plantings?licenseNumber=" + licenseNo;
				metricPayload = [{
					PlantLabel: sourceTag,
					PlantBatchName: BatchNumber,
					PlantBatchType: "Clone",
					PlantCount: qty,
					StrainName: strainName,
					LocationName: locationName,
					ActualDate: that.getSystemDate()
				}];
				that.callMetricsService(metrcUrl, "POST", metricPayload, function () {
					sap.m.MessageToast.show("Clone created  successfully");
					that.createCloneToTable(payLoadInventory, BatchNumber);
				}, function (error) {
					sap.m.MessageToast.show(JSON.stringify(error));
				});

			} else {
				that.createCloneToTable(payLoadInventory, BatchNumber);
			}
		},
		createCloneToTable: function (payLoadInventory, BatchNumber) {
			var that = this;
			this.updateServiecLayer("/b1s/v2/InventoryGenEntries", function (responseSL) {
				that.createCloneDialog.close();
				that.loadMasterData();
				if (responseSL) {
					that.loadMasterData();
					sap.m.MessageBox.success("Clone " + BatchNumber + " created successfully", {
						closeOnNavigation: false,
						onClose: function () {}
					});
				}
			}.bind(that), payLoadInventory, "POST", that.createCloneDialog);
		},
		onCloneClose: function () {
			this.createCloneDialog.close();
		},
		/**method for create clone planner**/

		onBarcodeScan: function () {
			//	var that = this;
			BarcodeScanner.scan(
				function (mResult) {
					var plant = mResult.text;
					sap.ui.core.Fragment.byId("CloneCreateDialog", "mPlant").setSelectedKey(plant);
				},
				function (Error) {
					sap.m.MessageToast.show("Scanning failed: " + Error);
				}
			);
		},

		onPlantsRefresh: function () {
			this.clearAllFilters();
			this.onCloseRefreshChart();
			this.byId("searchFieldTable").removeAllTokens();
			// this.loadMasterLocations();
			this.loadMasterData();
		},

		/** Method used for enable/disable kill plants on selecting rows in table/list.*/
		handleRowSelection: function () {
			var deviceModel = this.getView().getModel("device");
			var sItems;
			var table = this.getView().byId("clonePlannerTable");
			sItems = table.getSelectedIndices();
			var jsonModel = this.getOwnerComponent().getModel("jsonModel");
			if (sItems.length === 1) {
				var sObj = table.getContextByIndex(sItems).getObject();
				if (sObj.ItemName.includes("Teen") == true) {
					jsonModel.setProperty("/changeStrainsSelect", true);
				}

				if (sObj.ItemName.includes("Clone Sticking") == true || sObj.ItemName.includes("Clone Cuttings") == true || sObj.ItemName.includes(
						"Seeds") == true) {
					jsonModel.setProperty("/changeItemTypeSelect", true);
				}

				jsonModel.setProperty("/isSingleSelect", true);
			} else {
				jsonModel.setProperty("/isSingleSelect", false);
				jsonModel.setProperty("/changeStrainsSelect", false);
				jsonModel.setProperty("/changeItemTypeSelect", false);
			}

		},

		/* * Method used to print the plant label in plant quick view dialog*/

		onPressTutorial: function () {
			if (!this.TutorialDialog) {
				this.TutorialDialog = sap.ui.xmlfragment("TutorialDialog", "com.9b.clonePlanner2.view.fragments.Tutorial", this);
				this.getView().addDependent(this.TutorialDialog);
			}
			var src = "https://www.youtube.com/embed/WnwZqcgLcDI?start=185";
			var html = new sap.ui.core.HTML({
				preferDOM: true,
				content: '<iframe width="560" height="315" src="' + src +
					'" title="YouTube video player" frameborder="1" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen="true"></iframe>'
			});
			sap.ui.core.Fragment.byId("TutorialDialog", "webContent").removeAllContent();
			sap.ui.core.Fragment.byId("TutorialDialog", "webContent").addContent(html);
			this.TutorialDialog.open();
		},

		onClose: function () {
			this.TutorialDialog.close();
		},

		onCloneTypeSelect: function (evt) {
			var sIndex = evt.getParameter("selectedIndex");
			var jsonModel = this.getOwnerComponent().getModel("jsonModel");
			var cCloneData = jsonModel.getProperty("/cCloneData");
			if (sIndex === 0) {
				cCloneData.sCloneType = "MO";
			} else if (sIndex === 1) {
				cCloneData.sCloneType = "SE";
			} else if (sIndex === 2) {
				cCloneData.sCloneType = "RE";
			}
			jsonModel.setProperty("/cCloneData", cCloneData);
			if (jsonModel.getProperty("/showSrc") && (cCloneData.sCloneType === "SE" || cCloneData.sCloneType === "RE")) {
				sap.ui.core.Fragment.byId("CloneCreateDialog", "sourceInput").setVisible(true);
			} else {
				sap.ui.core.Fragment.byId("CloneCreateDialog", "sourceInput").setVisible(false);
			}
		},

		/*method for destroy the plants start*/
		performDestroyPlants: function () {
			var jsonModel = this.getOwnerComponent().getModel("jsonModel");
			jsonModel.setProperty("/enableDestroy", true);
			var sItems;
			var table = this.getView().byId("clonePlannerTable");
			var updateObject;
			var dateFormat = sap.ui.core.format.DateFormat.getDateInstance({
				pattern: 'MM-dd-yyyy'
			});
			var newdateT = dateFormat.format(new Date());
			sItems = table.getSelectedIndices();
			if (sItems.length === 0) {
				sap.m.MessageToast.show("Please select atleast one batch");
				return;
			}
			if (sItems.length > 0) {
				if (!this.confirmDestroyDialog) {
					this.confirmDestroyDialog = sap.ui.xmlfragment("dPlants", "com.9b.clonePlanner2.view.fragments.DestroyPlant", this);
					this.getView().addDependent(this.confirmDestroyDialog);
				}
				this.confirmDestroyDialog.open();
				var sArrayObj = [];
				var selObj;
				$.each(sItems, function (i, e) {
					selObj = table.getContextByIndex(e).getObject();
					var METRCLocCalls;
					if (selObj.ItemName.includes("Clone") == true || selObj.ItemName.includes("Seed") == true) {
						METRCLocCalls = "CLONE";
					} else {
						METRCLocCalls = "TEEN";
					}
					selObj.valueState = "None";
					selObj.eQty = "";
					selObj.U_NWTMT = "";
					selObj.U_NMTUS = "";
					selObj.U_NRSON = "";
					selObj.U_NNOTE = "";
					selObj.U_NWTWT = "";
					selObj.METRCLocCall = METRCLocCalls;
					selObj.SNO = "#" + (i + 1);
					selObj.U_NCRDT = new Date();
					selObj.U_NCRDT = new Date();
					sArrayObj.push(selObj);
				});
				jsonModel.setProperty("/destroyPlantData", sArrayObj);

				jsonModel.setProperty("/quantity", "");
				jsonModel.setProperty("/wasteWeight", "");
				jsonModel.setProperty("/Qty", "");
				jsonModel.setProperty("/temReason", "");
				jsonModel.setProperty("/wMethodDestroy", "");
				jsonModel.setProperty("/meterialUsedDestroy", "");
				jsonModel.setProperty("/temDestroyDate", new Date());
				jsonModel.setProperty("/temNotes", "");
				this.loadWasteMethodData();
				this.loadWasteResonData();
				this.loadReqItems().then((data1) => {
					jsonModel.setProperty("/allItemsDestroy", data1);
				});
			}
		},
		onDestroyTemApply: function () {
			var jsonModel = this.getOwnerComponent().getModel("jsonModel");
			var destroyPlantData = jsonModel.getProperty("/destroyPlantData");
			var temReason = jsonModel.getProperty("/temReason");
			var temDestroyDate = jsonModel.getProperty("/temDestroyDate");
			var wMethodDestroy = jsonModel.getProperty("/wMethodDestroy");
			var meterialUsedDestroy = jsonModel.getProperty("/meterialUsedDestroy");
			var quantityApply = jsonModel.getProperty("/quantity");
			var weightApply = jsonModel.getProperty("/wasteWeight");
			var temNotes = jsonModel.getProperty("/temNotes");
			$.each(destroyPlantData, function (i, e) {
				e.U_NWTMT = wMethodDestroy;
				e.U_NMTUS = meterialUsedDestroy;
				e.U_NRSON = temReason;
				e.U_NCRDT = temDestroyDate;
				e.U_NNOTE = temNotes;
				e.eQty = quantityApply;
				e.U_NWTWT = weightApply;
			});
			jsonModel.setProperty("/destroyPlantData", destroyPlantData);
		},
		onRecordWasteTemApply: function () {
			var jsonModel = this.getOwnerComponent().getModel("jsonModel");
			var recordWasteData = jsonModel.getProperty("/recordWasteData");
			var temWasteMethod = jsonModel.getProperty("/temWasteMethod");
			var temMaterialUsed = jsonModel.getProperty("/temMaterialUsed");
			var temReason = jsonModel.getProperty("/temReason");
			var temDestroyDate = jsonModel.getProperty("/temDestroyDate");
			var temNotes = jsonModel.getProperty("/temNotes");
			$.each(recordWasteData, function (i, e) {
				e.U_NWTMT = temWasteMethod;
				e.U_NMTUS = temMaterialUsed;
				e.U_NRSON = temReason;
				e.U_NCRDT = temDestroyDate;
				e.U_NNOTE = temNotes;
			});
			jsonModel.setProperty("/recordWasteData", recordWasteData);
		},
		onChangeWetWeightDestroy: function (evt) {
			var value = evt.getParameter("newValue");
			value = value.replace(/[^.\d]/g, '').replace(/^(\d*\.?)|(\d*)\.?/g, "$1$2");
			evt.getSource().setValue(value);
		},
		onChangeQuantityDestroy: function (evt) {
			var value = evt.getParameter("newValue");
			value = value.replace(/[^.\d]/g, '').replace(/^(\d*\.?)|(\d*)\.?/g, "$1$2");
			evt.getSource().setValue(value);
			var avlQty = Number(sap.ui.core.Fragment.byId("dPlants", "avalQty").getValue());
			if (isNaN(value)) {
				evt.getSource().setValueStateText("Enter numeric value only");
				evt.getSource().setValueState("Error");
				evt.getSource().focus();
			} else if (Number(value) > avlQty) {
				evt.getSource().setValueStateText("Entered Qty is more than available Qty");
				evt.getSource().setValueState("Error");
				evt.getSource().focus();
			} else {
				evt.getSource().setValueState("None");
			}
		},
		onDestroyClose: function (evt) {
			this.confirmDestroyDialog.close();
		},
		onDestoryDelete: function (evt) {
			var jsonModel = this.getView().getModel("jsonModel");
			var destroyPlantData = jsonModel.getProperty("/destroyPlantData");
			var sIndex = evt.getSource().getParent().getParent().indexOfItem(evt.getSource().getParent());
			destroyPlantData.splice(sIndex, 1);
			jsonModel.setProperty("/destroyPlantData", destroyPlantData);
		},
		onDestroyPlant: function () {
			var jsonModel = this.getOwnerComponent().getModel("jsonModel");
			jsonModel.setProperty("/enableDestroy", false);
			var destroyPlantData = jsonModel.getProperty("/destroyPlantData");
			var vegetationTable = this.getView().byId("vegetationTable");
			var metrcData = jsonModel.getProperty("/metrcData");
			var ChangeLocationList = jsonModel.getProperty("/ChangeLocationList");
			var ItemList = jsonModel.getProperty("/allItemsDestroy");

			var that = this;
			var isValidated = true;
			var errorMsg = [];
			$.each(destroyPlantData, function (i, sObj) {
				if (sObj.eQty === "") {
					isValidated = false;
					errorMsg.push("Please enter quantity");
					jsonModel.setProperty("/enableDestroy", true);
					return;
				} else if (sObj.eQty > sObj.Quantity) {
					isValidated = false;
					errorMsg.push("Entered quantity is more than available quantity");
					jsonModel.setProperty("/enableDestroy", true);
				} else if (sObj.U_NWTWT === "") {
					isValidated = false;
					errorMsg.push("Please enter waste weight");
					jsonModel.setProperty("/enableDestroy", true);
					return;
				} else if (sObj.U_NWTMT === "") {
					isValidated = false;
					errorMsg.push("Please select waste method");
					jsonModel.setProperty("/enableDestroy", true);
					return;
				} else if (sObj.U_NMTUS === "") {
					isValidated = false;
					errorMsg.push("Please enter material used");
					jsonModel.setProperty("/enableDestroy", true);
					return;
				} else if (sObj.U_NCRDT === "") {
					isValidated = false;
					errorMsg.push("Please select destroy date");
					jsonModel.setProperty("/enableDestroy", true);
					return;
				} else if (sObj.U_NRSON === "") {
					isValidated = false;
					errorMsg.push("Please select reason");
					jsonModel.setProperty("/enableDestroy", true);
					return;
				} else if (sObj.U_NNOTE === "") {
					isValidated = false;
					errorMsg.push("Please enter notes");
					jsonModel.setProperty("/enableDestroy", true);
					return;
				}
			});
			errorMsg = this.removeDuplicates(errorMsg);
			if (!isValidated) {
				sap.m.MessageToast.show(errorMsg.join("\n"));
				return;
			}
			var batchUrl = [],
				metricPayload = [],
				metrcclonePayLoad = [],
				payLoadCreate, cDate, payLoadInventoryExits;
			$.each(destroyPlantData, function (i, sObj) {
				cDate = that.getSystemDate(sObj.U_NCRDT);
				payLoadCreate = {
					U_NPQTY: sObj.eQty, // destroy quantity
					U_NDTRS: sObj.U_NRSON,
					U_NNOTE: sObj.U_NNOTE, // destroy note
					U_NCLPL: "CLONES", //clone or planr
					U_NPHSE: "CLONES", //phase
					U_NWTUM: "Pounds",
					U_NWTMT: sObj.U_NWTMT,
					U_NMTUS: sObj.U_NMTUS,
					U_NLCNM: sObj.BinLocationCode, //location
					U_NCRDT: cDate,
					U_NLFID: sObj.U_MetrcLicense, //license no
					U_NPLID: sObj.BatchNum, //plant id
					//U_NSTNM: sObj.U_NSTNM, //strain name
					U_NPBID: sObj.BatchNum, //batch Id 
				};
				batchUrl.push({
					url: "/b1s/v2/NDRPL",
					data: payLoadCreate,
					method: "POST"
				});
				var AbslocationEntry = "",
					BinCode = "",
					InventoryUOM = "",
					WarehouseCode = "";
				$.each(ChangeLocationList, function (i, obj) {
					if (obj.BinCode && sObj.BinLocationCode.toLowerCase() == obj.BinCode.toLowerCase()) {
						AbslocationEntry = obj.AbsEntry;
						WarehouseCode = obj.Warehouse;
						BinCode = obj.BinCode;
					}
				});

				$.each(ItemList, function (j, k) {
					if (k.ItemName && sObj.ItemName && k.ItemName == sObj.ItemName) {
						InventoryUOM = k.InventoryUOM;
						return false;
					}
				});

				payLoadInventoryExits = {
					"BPL_IDAssignedToInvoice": jsonModel.getProperty("/sLinObj").U_Branch,
					"Comments": "Immature Plants - Destroy Plants",
					"DocumentLines": []
				};
				payLoadInventoryExits.DocumentLines.push({
					"ItemCode": sObj.ItemCode, //<THIS IS SELECTED ITEM> 
					"WarehouseCode": WarehouseCode, // sObj.WhsCode.split("-")[0], // <THIS IS FROM CLONE ROOM>
					"Quantity": sObj.eQty, // <THIS IS THE QTY OF CLONES>
					"CostingCode": "NURS",
					"BatchNumbers": [{
						"BatchNumber": sObj.BatchNum, // <THIS IS TAG>
						"Quantity": sObj.eQty, //<THIS IS THE QTY OF CLONES>
						"Location": BinCode, //sObj.WhsCode //<THIS IS FROM CLONE ROOM>
					}],
					"DocumentLinesBinAllocations": [{
						"BinAbsEntry": Number(AbslocationEntry),
						"Quantity": sObj.eQty,
						"SerialAndBatchNumbersBaseLine": 0
					}]
				});
				batchUrl.push({
					url: "/b1s/v2/InventoryGenExits",
					data: payLoadInventoryExits,
					method: "POST"
				});
				if (metrcData && metrcData.U_NACST === "X") {

					if (sObj.METRCLocCall == "TEEN") {

						var metricObj = {
							PlantBatch: sObj.BatchNum,
							Count: sObj.eQty,
							WasteMethodName: sObj.U_NWTMT,
							WasteMaterialMixed: sObj.U_NMTUS,
							WasteReasonName: sObj.U_NRSON,
							ReasonNote: sObj.U_NNOTE,
							WasteWeight: sObj.U_NWTWT,
							WasteUnitOfMeasure: "Pounds",
							ActualDate: that.getSystemDate()
						};
						metricPayload.push(metricObj);

					} else {

						var metrcclonePayLoadObj = {
							Label: sObj.BatchNum,
							Quantity: -Number(sObj.eQty),
							UnitOfMeasure: InventoryUOM,
							AdjustmentReason: "Damage",
							AdjustmentDate: that.getSystemDate(),
							ReasonNote: "Immature plants - destroy button (adjust)"
						};
						metrcclonePayLoad.push(metrcclonePayLoadObj);
					}

				}
			});
			that.readServiecLayer("/b1s/v2/UsersService_GetCurrentUser", function (resP) {
				if (metrcData && metrcData.U_NACST === "X") {
					jsonModel.setProperty("/busyView", true);
					//that.confirmDestroyDialog.setBusy(true);

					if (metricPayload.length > 0 && metrcclonePayLoad.length > 0) {
						var metrcUrl = "/plantbatches/v2/?licenseNumber=" + jsonModel.getProperty("/selectedLicense");
						that.callMetricsService(metrcUrl, "POST", metricPayload, function () {

							var metrcUrl2 = "/packages/v2/adjust?licenseNumber=" + jsonModel.getProperty("/selectedLicense");
							that.callMetricsService(metrcUrl2, "POST", metrcclonePayLoad, function () {
								sap.m.MessageToast.show("METRC sync completed successfully");
								that.destroyDataToTable(batchUrl);

							}, function (error) {
								sap.m.MessageToast.show(JSON.stringify(error));
								jsonModel.setProperty("/busyView", false);
								jsonModel.setProperty("/enableDestroy", true);
							});
						}, function (error) {
							//that.confirmDestroyDialog.setBusy(false);
							sap.m.MessageToast.show(JSON.stringify(error));
							jsonModel.setProperty("/busyView", false);
							jsonModel.setProperty("/enableDestroy", true);
						});

					} else {

						if (metricPayload.length > 0) {
							var metrcUrl = "/plantbatches/v2/?licenseNumber=" + jsonModel.getProperty("/selectedLicense");
							that.callMetricsService(metrcUrl, "POST", metricPayload, function () {
								//that.confirmDestroyDialog.setBusy(false);
								sap.m.MessageToast.show("METRC sync completed successfully");
								that.destroyDataToTable(batchUrl);
							}, function (error) {
								//that.confirmDestroyDialog.setBusy(false);
								sap.m.MessageToast.show(JSON.stringify(error));
								jsonModel.setProperty("/busyView", false);
								jsonModel.setProperty("/enableDestroy", true);
							});
						}

						if (metrcclonePayLoad.length > 0) {
							var metrcUrl2 = "/packages/v2/adjust?licenseNumber=" + jsonModel.getProperty("/selectedLicense");
							that.callMetricsService(metrcUrl2, "POST", metrcclonePayLoad, function () {
								sap.m.MessageToast.show("METRC sync completed successfully");
								that.destroyDataToTable(batchUrl);

							}, function (error) {
								sap.m.MessageToast.show(JSON.stringify(error));
								jsonModel.setProperty("/busyView", false);
								jsonModel.setProperty("/enableDestroy", true);
							});
						}

					}

				} else {
					that.destroyDataToTable(batchUrl);
				}
			});
		},
		destroyDataToTable: function (batchUrl) {
			var jsonModel = this.getOwnerComponent().getModel("jsonModel");
			var that = this;
			//this.confirmDestroyDialog.setBusy(true);
			jsonModel.setProperty("/errorTxt", []);
			this.createBatchCall(batchUrl, function () {
				//that.confirmDestroyDialog.setBusy(false);
				var errorTxt = jsonModel.getProperty("/errorTxt");
				if (errorTxt.length > 0) {
					sap.m.MessageBox.error(errorTxt.join("\n"));
					jsonModel.setProperty("/busyView", false);
					jsonModel.setProperty("/enableDestroy", true);
					//this.confirmDestroyDialog.setBusy(false);
				} else {
					sap.m.MessageToast.show("Plant status changed successfully");
					jsonModel.setProperty("/busyView", false);
					jsonModel.setProperty("/enableDestroy", true);
					//this.confirmDestroyDialog.setBusy(false);
				}
				//this.confirmDestroyDialog.setBusy(false);
				that.confirmDestroyDialog.close();
				that.loadMasterData();
				that.byId("clonePlannerTable").setSelectedIndex(-1);
			});
		},

		itemSearchSplitBatches: function (evt) {
			var that = this;
			var jsonModel = this.getOwnerComponent().getModel("jsonModel");
			var ItemName = evt.ItemName;
			var licenseNo;
			// var jsonModel = this.getOwnerComponent().getModel("jsonModel");
			var sLicenNo = jsonModel.getProperty("/selectedLicense");
			if (sLicenNo !== undefined) {
				licenseNo = sLicenNo;
			} else if (jsonModel.getProperty("/licenseList").length > 0) {
				licenseNo = jsonModel.getProperty("/licenseList")[0].U_MetrcLicense;
			} else {
				licenseNo = "";
			}
			//var filters = "?$filter=ItemName eq '" + ItemName + "'";
			//filters = filters.replace(/#/g, "%23");
			var filters = "?$filter=ItemCode eq '" + evt.ItemCode + "'";
			var fields = "&$select=" + ["ItemName", "ItemsGroupCode", "ItemCode", "U_MCAT", "ProdStdCost", "InventoryUOM"].join();
			jsonModel.setProperty("/ComboBoxBusy", true);
			this.readServiecLayer("/b1s/v2/Items" + filters + fields, function (data1) {
				jsonModel.setProperty("/ComboBoxBusy", false);
				jsonModel.setProperty("/cloneItemListSplitBatch", data1.value);
				sap.ui.core.Fragment.byId("splitPackageClone", "item").setValue(data1.value[0].ItemName);
				jsonModel.setProperty("/splitPkgObj/sItem", data1.value[0].ItemCode + "-" + data1.value[0].ProdStdCost + "-" + data1.value[0].InventoryUOM);
			});
		},

		handleCreateSplitPackage: function () {
			var that = this;
			var jsonModel = this.getOwnerComponent().getModel("jsonModel");
			jsonModel.setProperty("/enableSplit", true);
			var selectedBinCode = jsonModel.getProperty("/selectedBinCode");
			var selectedWarehouse = jsonModel.getProperty("/selectedWarehouse");
			var selectedAbsEntry = jsonModel.getProperty("/selectedAbsEntry");
			var selKey = selectedWarehouse + "-" + selectedAbsEntry + "-" + selectedBinCode;
			var sItems;
			var table = this.getView().byId("clonePlannerTable");
			sItems = table.getSelectedIndices();
			var data = table.getContextByIndex(sItems).getObject();
			var licenseNo = jsonModel.getProperty("/selectedLicense");
			that.itemSearchSplitBatches(data);
			this.loadLocationData();

			this.loadCloneItems();
			if (sItems.length > 0) {
				if (!this.splitPackageClonesDialog) {
					this.splitPackageClonesDialog = sap.ui.xmlfragment("splitPackageClone", "com.9b.clonePlanner2.view.fragments.SplitPackage",
						this);
					this.getView().addDependent(this.splitPackageClonesDialog);
				}
				var updateObject = table.getContextByIndex(sItems).getObject();
				var METRCLocCalls;
				if (updateObject.ItemName.includes("Clone") == true || updateObject.ItemName.includes("Seed") == true) {
					METRCLocCalls = "CLONE";
					this.loadTagsDataInPkg();
				} else {
					METRCLocCalls = "TEEN";
					this.loadMetrcTags();
				}
				var splitPkgObj = {
					BatchNum: updateObject.BatchNum,
					MnfSerial: updateObject.MnfSerial,
					SourceUID: updateObject.SourceUID,
					Quantity: updateObject.Quantity,
					newTag: "",
					newQty: "",
					METRCLocCall: METRCLocCalls,
					//Loc: "",
					Loc: selKey,
					sItem: "",
					ItemName: updateObject.ItemName,
				};
				jsonModel.setProperty("/splitPkgObj", splitPkgObj);
				this.splitPackageClonesDialog.open();
			} else {
				sap.m.MessageToast.show("Please select atleast one batch");
			}
		},
		onChangeQuantitySplit: function (evt) {
			//var newValue = evt.getParameter("newValue");
			var value = evt.getParameter("newValue");
			value = value.replace(/[^.\d]/g, '').replace(/^(\d*\.?)|(\d*)\.?/g, "$1$2");
			evt.getSource().setValue(value);
			var avlQty = Number(sap.ui.core.Fragment.byId("splitPackageClone", "avalQty").getValue());
			if (isNaN(value)) {
				evt.getSource().setValueStateText("Enter numeric value only");
				evt.getSource().setValueState("Error");
				evt.getSource().focus();
			} else if (Number(value) > avlQty) {
				evt.getSource().setValueStateText("Entered Qty is more than available Qty");
				evt.getSource().setValueState("Error");
				evt.getSource().focus();
			} else {
				evt.getSource().setValueState("None");
			}
		},
		closeSplitPackage: function () {
			this.splitPackageClonesDialog.close();
		},
		onCreateSplitPackage: function () {
			var jsonModel = this.getOwnerComponent().getModel("jsonModel");
			jsonModel.setProperty("/enableSplit", false);
			var splitPkgObj = jsonModel.getProperty("/splitPkgObj");
			var ChangeLocationList = jsonModel.getProperty("/ChangeLocationList");
			var avalQty = splitPkgObj.Quantity;
			var locationID = splitPkgObj.Loc;
			var qty = Number(splitPkgObj.newQty);
			var newTag = splitPkgObj.newTag;
			var sTag = splitPkgObj.BatchNum;
			var sItem = splitPkgObj.sItem;
			var itemCodeEntry = sItem.split("-")[0];
			var ProdStdCost = sItem.split("-")[1];
			var InventoryUOM = sItem.split("-")[2];
			if (newTag == "") {
				sap.m.MessageToast.show("Please enter new tag");
				jsonModel.setProperty("/enableSplit", true);
				return;
			}
			if (locationID == "") {
				sap.m.MessageToast.show("Please select location");
				jsonModel.setProperty("/enableSplit", true);
				return;
			}
			if (qty == "") {
				sap.m.MessageToast.show("Please enter quantity");
				jsonModel.setProperty("/enableSplit", true);
				return;
			}
			if (isNaN(qty)) {
				sap.m.MessageToast.show("Please enter numeric value only");
				jsonModel.setProperty("/enableSplit", true);
				return;
			}
			if (qty > avalQty) {
				sap.m.MessageToast.show("Entered qty is more than available qty");
				jsonModel.setProperty("/enableSplit", true);
				return;
			}
			var sObj;
			var table = this.getView().byId("clonePlannerTable");
			sObj = table.getContextByIndex(table.getSelectedIndices()[0]).getObject();
			var itemName = sObj.ItemName;
			var strainName = itemName.substring(0, itemName.lastIndexOf("-")).trim();
			var that = this;
			var batchID = newTag;
			var batchUrl = [],
				AbslocationEntry, BinCode, locationName;
			// InventoryExits
			var BatchNumber = sObj.BatchNum;
			var rObj = $.grep(ChangeLocationList, function (sLoc) {
				if (sLoc.BinCode === locationID.replace(locationID.split("-")[0], "").replace("-", "").replace(locationID.split("-")[1], "")
					.replace("-", "")) {
					return sLoc;
				}
			});
			locationName = rObj[0].U_MetrcLocation;
			$.each(ChangeLocationList, function (i, obj) {
				if (sObj.BinLocationCode.toLowerCase() == obj.BinCode.toLowerCase()) {
					AbslocationEntry = obj.AbsEntry;
					BinCode = obj.BinCode;
				}
			});
			var payLoadInventoryExits = {
				"BPL_IDAssignedToInvoice": jsonModel.getProperty("/sLinObj").U_Branch,
				"Comments": "Immature Plants - Split Batch",
				"DocumentLines": []
			};
			payLoadInventoryExits.DocumentLines.push({
				"ItemCode": sObj.ItemCode, //<THIS IS SELECTED ITEM>
				"WarehouseCode": sObj.WhsCode.split("-")[0], //sObj.WhsCode.split("-")[0], // <THIS IS FROM CLONE ROOM>
				"Quantity": qty, // <THIS IS THE QTY OF CLONES>
				"CostingCode": "NURS",
				"BatchNumbers": [{
					"BatchNumber": BatchNumber, // <THIS IS TAG>
					"Quantity": qty, //<THIS IS THE QTY OF CLONES>
					"Location": BinCode //sObj.WhsCode //<THIS IS FROM CLONE ROOM>
				}],
				"DocumentLinesBinAllocations": [{
					"BinAbsEntry": Number(AbslocationEntry),
					"Quantity": qty,
					"SerialAndBatchNumbersBaseLine": 0
				}]
			});
			batchUrl.push({
				url: "/b1s/v2/InventoryGenExits",
				data: payLoadInventoryExits,
				method: "POST"
			});

			// InventoryEntry
			var payLoadInventoryEntry = {
				"BPL_IDAssignedToInvoice": jsonModel.getProperty("/sLinObj").U_Branch,
				"Comments": "Immature Plants - Split Batch",
				"DocumentLines": []
			};
			payLoadInventoryEntry.DocumentLines.push({
				//"ItemCode": itemCodeEntry, //sObj.ItemCode, //<THIS IS SELECTED ITEM> 
				"ItemCode": sObj.ItemCode, //<THIS IS SELECTED ITEM>
				"WarehouseCode": locationID.split("-")[0], // <THIS IS FROM CLONE ROOM>
				"Quantity": qty, // <THIS IS THE QTY OF CLONES>
				"UnitPrice": Number(ProdStdCost),
				"CostingCode": "NURS",
				"BatchNumbers": [{
					"BatchNumber": batchID, // <THIS IS TAG>
					"Quantity": qty, //<THIS IS THE QTY OF CLONES>
					"Location": locationID.replace(locationID.split("-")[0], "").replace("-", "").replace(locationID.split("-")[1], "").replace(
						"-", ""),
					//locationID.replace(locationID.split("-")[0],"").replace("-", ""), //<THIS IS FROM CLONE ROOM>
					"U_Phase": "Immature",
					"U_BatAttr3": sObj.SourceUID, //sourceTag
					"ManufacturerSerialNumber": sObj.MnfSerial, //harvest name
					"U_LotNumber": sObj.U_LotNumber,
					"U_IsPackage": "NO"
				}],
				"DocumentLinesBinAllocations": [{
					"BinAbsEntry": Number(locationID.split("-")[1]),
					"Quantity": qty,
					"SerialAndBatchNumbersBaseLine": 0
				}]
			});
			batchUrl.push({
				url: "/b1s/v2/InventoryGenEntries",
				data: payLoadInventoryEntry,
				method: "POST"
			});
			var metrcData = jsonModel.getProperty("/metrcData");
			that.readServiecLayer("/b1s/v2/UsersService_GetCurrentUser", function (resP) {
				if (metrcData && metrcData.U_NACST === "X") {

					if (splitPkgObj.METRCLocCall == "TEEN") {

						var metricPayload = [{
							PlantBatch: sTag,
							GroupName: newTag,
							Count: qty,
							Location: locationName, //changed by susmita for METRC call for location
							Strain: strainName,
							ActualDate: that.getSystemDate()
						}];

						var metrcUrl = "/plantbatches/v2/split?licenseNumber=" + jsonModel.getProperty("/selectedLicense");
						//that.splitPackageClonesDialog.setBusy(true);
						jsonModel.setProperty("/busyView", true);
						that.callMetricsService(metrcUrl, "POST", metricPayload, function () {
							//that.splitPackageClonesDialog.setBusy(false);
							// sap.m.MessageToast.show("Split Package Created Successfully");
							that.createSplitToTable(batchUrl);
						}, function (error) {
							//that.splitPackageClonesDialog.setBusy(false);
							jsonModel.setProperty("/busyView", false);
							jsonModel.setProperty("/enableSplit", true);
							sap.m.MessageToast.show(JSON.stringify(error.responseText));
						});
					} else {
						var pObj = [{
							Tag: newTag,
							Location: locationName, //sObj.U_MetrcLocation,
							Item: itemName, //sObj.ItemName,
							Quantity: Number(qty),
							UnitOfMeasure: InventoryUOM,
							// PatientLicenseNumber: null,
							Note: "Immature plants - split batch",
							// IsProductionBatch: false,
							// IsDonation: false,
							// ProductRequiresRemediation: false,
							// UseSameItem: false,
							ActualDate: that.getSystemDate(),
							Ingredients: [{
								Package: sTag,
								Quantity: Number(qty),
								UnitOfMeasure: InventoryUOM
							}]
						}];

						var metrcUrl2 = "/packages/v2/?licenseNumber=" + jsonModel.getProperty("/selectedLicense");
						that.callMetricsService(metrcUrl2, "POST", pObj, function () {
							// that.createPackage.setBusy(false);
							sap.m.MessageToast.show("METRC sync completed successfully");
							that.createSplitToTable(batchUrl);
						}, function (error) {
							jsonModel.setProperty("/busyView", false);
							jsonModel.setProperty("/enableSplit", true);
							sap.m.MessageToast.show(JSON.stringify(error.responseText));
						});

					}

				} else {
					that.createSplitToTable(batchUrl);
				}
			});
		},
		createSplitToTable: function (batchUrl) {
			var that = this;
			var jsonModel = this.getOwnerComponent().getModel("jsonModel");
			jsonModel.setProperty("/errorTxt", []);
			//this.splitPackageClonesDialog.setBusy(true);
			this.createBatchCall(batchUrl, function () {
				//that.splitPackageClonesDialog.setBusy(false);
				var errorTxt = jsonModel.getProperty("/errorTxt");
				if (errorTxt.length > 0) {
					jsonModel.setProperty("/busyView", false);
					jsonModel.setProperty("/enableSplit", true);
					//that.splitPackageClonesDialog.setBusy(false);
					sap.m.MessageBox.error(errorTxt.join("\n"));
				}
				sap.m.MessageToast.show("Split package created successfully");
				jsonModel.setProperty("/busyView", false);
				jsonModel.setProperty("/enableSplit", true);
				that.loadMasterData();
				that.splitPackageClonesDialog.close();
			}, this.splitPackageClonesDialog);
		},

		onChangeLocTemApply: function () {
			var jsonModel = this.getOwnerComponent().getModel("jsonModel");
			var temLocation = sap.ui.core.Fragment.byId("changeLocationDialog", "temLocationId");
			var sLocText = "";
			if (temLocation.getSelectedItem()) {
				var sLocText = temLocation.getSelectedItem().getText();
			}
			var changeLocData = jsonModel.getProperty("/changeLocData");
			var sLoc = jsonModel.getProperty("/temChangeLoc");
			$.each(changeLocData, function (i, e) {
				e.U_NLOCD_TO = sLoc;
				e.U_NLCNM_TO = sLocText;
			});
			jsonModel.setProperty("/changeLocData", changeLocData);
		},
		onLocationDelete: function (evt) {
			var jsonModel = this.getView().getModel("jsonModel");
			var changeLocData = jsonModel.getProperty("/changeLocData");
			var sIndex = evt.getSource().getParent().getParent().indexOfItem(evt.getSource().getParent());
			changeLocData.splice(sIndex, 1);
			jsonModel.setProperty("/changeLocData", changeLocData);
		},

		handlechangeLocation: function () {
			var jsonModel = this.getOwnerComponent().getModel("jsonModel");
			jsonModel.setProperty("/enableChange", true);
			var sItems;
			var table = this.getView().byId("clonePlannerTable");
			var sArrayObj = [];
			sItems = table.getSelectedIndices();
			var licenseNo = jsonModel.getProperty("/selectedLicense");
			if (sItems.length > 0) {
				if (!this.changeLocationDialog) {
					this.changeLocationDialog = sap.ui.xmlfragment("changeLocationDialog", "com.9b.clonePlanner2.view.fragments.ChangeLocation",
						this);
					this.getView().addDependent(this.changeLocationDialog);
				}
				// sap.ui.core.Fragment.byId("changeLocationDialog", "location").setSelectedKey("");
				this.changeLocationDialog.open();
				var selObj;
				$.each(sItems, function (i, e) {
					selObj = table.getContextByIndex(e).getObject();
					selObj.U_NLOCD_TO = "";
					selObj.U_NLCNM_TO = "";
					selObj.SNO = "#" + (i + 1);

					if (selObj.ItemName.includes("Clone") == true || selObj.ItemName.includes("Seed") == true) {
						selObj.METRCLocCall = "CLONE";
					} else {
						selObj.METRCLocCall = "TEEN";
					}

					sArrayObj.push(selObj);
				});
				this.loadCloneItems();
				jsonModel.setProperty("/changeLocData", sArrayObj);
				jsonModel.setProperty("/temChangeLoc", "");

			} else {
				sap.m.MessageToast.show("Please select atleast one batch");
			}
		},
		onCloseChangeLocation: function () {
			this.changeLocationDialog.close();
		},
		onChangeLocation: function () {
			var that = this;
			var jsonModel = this.getOwnerComponent().getModel("jsonModel");
			jsonModel.setProperty("/enableChange", false);
			var metrcData = jsonModel.getProperty("/metrcData");
			var changeLocData = jsonModel.getProperty("/changeLocData");
			var isValidated = true;
			$.each(changeLocData, function (i, Obj) {
				if (!Obj.U_NLOCD_TO) {
					isValidated = false;
					sap.m.MessageToast.show("Please select location");
					jsonModel.setProperty("/enableChange", true);
					return;
				}
				var locationcode = Obj.U_NLOCD_TO;
				if (Obj.BinLocationCode.toLowerCase() == locationcode.replace(locationcode.split("-")[0], "").replace("-", "").replace(
						locationcode.split("-")[1], "")
					.replace("-", "").toLowerCase()) {
					isValidated = false;
					sap.m.MessageToast.show("You have selected same location, Please select another location");
					jsonModel.setProperty("/enableChange", true);
					return;
				}
			});
			if (isValidated) {
				var sItems;
				var clonePlannerTable = this.getView().byId("clonePlannerTable");
				sItems = clonePlannerTable.getSelectedIndices();
				var sObj, locationName, locationID, payLoadInventoryTransfer = {},
					batchUrl = [],
					metricPayload = [],
					metrcClonePayload = [];
				$.each(changeLocData, function (i, sObj) {
					var Locations = jsonModel.getProperty("/ChangeLocationList");
					locationID = sObj.U_NLOCD_TO;
					var rObj = $.grep(Locations, function (sLoc) {
						if (sLoc.BinCode === locationID.replace(locationID.split("-")[0], "").replace("-", "").replace(locationID.split("-")[1], "")
							.replace("-", "")) {
							return sLoc;
						}
					});
					locationName = rObj[0].U_MetrcLocation;
					var ProdStdCost;
					var cloneItemList = jsonModel.getProperty("/cloneItemList");
					$.each(cloneItemList, function (j, k) {
						if (k.ItemCode && sObj.ItemCode == k.ItemCode) {
							ProdStdCost = k.ProdStdCost;
						}
					});
					var AbslocationEntry = "",
						BinCode = "";
					var ChangeLocationList = jsonModel.getProperty("/ChangeLocationList");
					$.each(ChangeLocationList, function (i, obj) {
						if (sObj.BinLocationCode.toLowerCase() == obj.BinCode.toLowerCase()) {
							AbslocationEntry = obj.AbsEntry;
							BinCode = obj.BinCode;
						}
					});
					if (sObj.U_MetrcLocation.toLowerCase() !== locationName.toLowerCase()) {
						var BatchNumber = sObj.BatchNum;
						var quantity = sObj.Quantity;
						var payLoadInventoryTransfer = {
							"FromWarehouse": sObj.WhsCode.split("-")[0],
							"ToWarehouse": locationID.split("-")[0],
							"BPLID": jsonModel.getProperty("/sLinObj").U_Branch,
							"Comments": "Immature Plants - Change Location",
							"StockTransferLines": []
						};
						payLoadInventoryTransfer.StockTransferLines.push({
							"LineNum": 0,
							"ItemCode": sObj.ItemCode, //<THIS IS THE QTY OF CLONES>
							"Quantity": quantity, //<THIS IS FROM CLONE ROOM>
							"UnitPrice": ProdStdCost,
							"WarehouseCode": locationID.split("-")[0], // <THIS IS TAG>
							"FromWarehouseCode": sObj.WhsCode.split("-")[0],
							"BatchNumbers": [{
								"Quantity": quantity, // <THIS IS TAG>
								"BatchNumber": BatchNumber,
								"Location": locationID.replace(locationID.split("-")[0], "").replace("-", "").replace(locationID.split("-")[1], "").replace(
									"-", ""),
							}],
							"StockTransferLinesBinAllocations": [{
								"BinAbsEntry": Number(AbslocationEntry),
								"Quantity": quantity,
								"SerialAndBatchNumbersBaseLine": 0,
								"BinActionType": "batFromWarehouse",
								"BaseLineNumber": 0
							}, {
								"BinAbsEntry": Number(locationID.split("-")[1]),
								"Quantity": quantity,
								"SerialAndBatchNumbersBaseLine": 0,
								"BinActionType": "batToWarehouse",
								"BaseLineNumber": 0
							}]
						});
						batchUrl.push({
							url: "/b1s/v2/StockTransfers",
							data: payLoadInventoryTransfer,
							method: "POST"
						});
						if (metrcData && metrcData.U_NACST === "X") {

							if (sObj.METRCLocCall == "TEEN") {
								metricPayload.push({
									Name: sObj.BatchNum,
									Location: locationName,
									MoveDate: that.getSystemDate(new Date())
								});
							} else {
								metrcClonePayload.push({
									Label: sObj.BatchNum,
									Location: locationName,
									MoveDate: that.getSystemDate(new Date())
								});
							}

						}
					}
				});

				if (batchUrl.length > 0) {
					that.readServiecLayer("/b1s/v2/UsersService_GetCurrentUser", function (resP) {
						if (metrcData && metrcData.U_NACST === "X") {
							//that.changeLocationDialog.setBusy(true);
							if (metricPayload.length > 0 && metrcClonePayload.length > 0) {

								var metrcUrl = "/plantbatches/v2/location?licenseNumber=" + jsonModel.getProperty("/selectedLicense");
								jsonModel.setProperty("/busyView", true);
								that.callMetricsService(metrcUrl, "PUT", metricPayload, function (res) {

									var metrcUrl2 = "/packages/v2/location?licenseNumber=" + jsonModel.getProperty("/selectedLicense");
									that.callMetricsService(metrcUrl2, "PUT", metrcClonePayload, function (res) {
										//that.changeLocationDialog.setBusy(false);
										sap.m.MessageToast.show("METRC sync completed successfully");
										that.changeLocationToTable(batchUrl);
									}, function (error) {
										//that.changeLocationDialog.setBusy(false);
										sap.m.MessageToast.show(JSON.stringify(error));
										jsonModel.setProperty("/busyView", false);
										jsonModel.setProperty("/enableChange", true);
									});

								}, function (error) {
									//that.changeLocationDialog.setBusy(false);
									sap.m.MessageToast.show(JSON.stringify(error));
									jsonModel.setProperty("/busyView", false);
									jsonModel.setProperty("/enableChange", true);
								});

							} else {

								if (metricPayload.length > 0) {
									var metrcUrl = "/plantbatches/v2/location?licenseNumber=" + jsonModel.getProperty("/selectedLicense");
									jsonModel.setProperty("/busyView", true);
									that.callMetricsService(metrcUrl, "PUT", metricPayload, function (res) {
										//that.changeLocationDialog.setBusy(false);
										sap.m.MessageToast.show("METRC sync completed successfully");
										that.changeLocationToTable(batchUrl);
									}, function (error) {
										//that.changeLocationDialog.setBusy(false);
										sap.m.MessageToast.show(JSON.stringify(error));
										jsonModel.setProperty("/busyView", false);
										jsonModel.setProperty("/enableChange", true);
									});
								}

								if (metrcClonePayload.length > 0) {
									var metrcUrl2 = "/packages/v2/location?licenseNumber=" + jsonModel.getProperty("/selectedLicense");
									jsonModel.setProperty("/busyView", true);
									that.callMetricsService(metrcUrl2, "PUT", metrcClonePayload, function (res) {
										//that.changeLocationDialog.setBusy(false);
										sap.m.MessageToast.show("METRC sync completed successfully");
										that.changeLocationToTable(batchUrl);
									}, function (error) {
										//that.changeLocationDialog.setBusy(false);
										sap.m.MessageToast.show(JSON.stringify(error));
										jsonModel.setProperty("/busyView", false);
										jsonModel.setProperty("/enableChange", true);
									});
								}

							}

						} else {
							that.changeLocationToTable(batchUrl);
						}
					});
				} else {
					sap.m.MessageToast.show("You have selected same location, Please select another location");
				}
			}
		},
		changeLocationToTable: function (batchUrl) {
			var that = this;
			var jsonModel = this.getOwnerComponent().getModel("jsonModel");
			jsonModel.setProperty("/errorTxt", []);
			//this.changeLocationDialog.setBusy(true);
			this.createBatchCall(batchUrl, function () {
				//that.changeLocationDialog.setBusy(false);
				var errorTxt = jsonModel.getProperty("/errorTxt");
				if (errorTxt.length > 0) {
					sap.m.MessageBox.error(errorTxt.join("\n"));
					//that.changeLocationDialog.setBusy(false);
				}
				//that.changeLocationDialog.setBusy(false);
				jsonModel.setProperty("/busyView", false);
				jsonModel.setProperty("/enableChange", true);
				that.changeLocationDialog.close();
				sap.m.MessageToast.show("Location changed successfully");
				that.byId("clonePlannerTable").setSelectedIndex(-1);
				// that.changeLocationDialog.setBusy(false);
				that.loadMasterData();
			});
		},

		changeGrowthItemListSticking: function () {
			var jsonModel = this.getOwnerComponent().getModel("jsonModel");
			///var filters = "?$filter=contains(ItemName,'Block')";//Block dropdown to Item Group 141
			var filters = "?$filter= ItemsGroupCode eq 141";
			var fields = "&$select=" + ["ItemName", "ItemsGroupCode", "ItemCode", "U_MCAT", "ProdStdCost", "ItemWarehouseInfoCollection"].join();
			jsonModel.setProperty("/ComboBoxBusy", true);
			this.readServiecLayer("/b1s/v2/Items" + filters + fields, function (data1) {
				jsonModel.setProperty("/ComboBoxBusy", false);
				jsonModel.setProperty("/changeGrowthItemListSticking", data1.value);
			});
		},

		changeGrowthItemListCutting: function () {
			var jsonModel = this.getOwnerComponent().getModel("jsonModel");
			//var filters = "?$filter=contains(ItemName,'Plugs')"; //Plugs dropdown to Item Group 140
			var filters = "?$filter= ItemsGroupCode eq 140";
			var fields = "&$select=" + ["ItemName", "ItemsGroupCode", "ItemCode", "U_MCAT", "ProdStdCost", "ItemWarehouseInfoCollection"].join();
			jsonModel.setProperty("/ComboBoxBusy", true);
			this.readServiecLayer("/b1s/v2/Items" + filters + fields, function (data1) {
				jsonModel.setProperty("/ComboBoxBusy", false);
				jsonModel.setProperty("/changeGrowthItemListCutting", data1.value);
			});
		},

		onPlugsChange: function (evt) {
			var jsonModel = this.getOwnerComponent().getModel("jsonModel");
			var sObj = evt.getSource().getSelectedItem().getBindingContext("jsonModel").getObject();
			var table = this.getView().byId("clonePlannerTable");
			var sItems = table.getSelectedIndices();
			var warehouse = table.getContextByIndex(sItems).getObject().WhsCode;
			var plugsQTY;
			$.each(sObj.ItemWarehouseInfoCollection, function (i, obj) {
				if (warehouse && obj.WarehouseCode && warehouse == obj.WarehouseCode) {
					plugsQTY = obj.InStock;
				}
			});
			jsonModel.setProperty("/plugsAvalQTY", plugsQTY);

		},

		onChangeQtyPlugs: function (evt) {
			var jsonModel = this.getOwnerComponent().getModel("jsonModel");
			var value = evt.getParameter("newValue");

			// if(value > jsonModel.getProperty("/plugsAvalQTY") ){

			if (jsonModel.getProperty("/gPhase") == "Sticking") {
				if (value > jsonModel.getProperty("/plugsAvalQTY")) {
					jsonModel.setProperty("/valueStateplugsSt", "Error");
					jsonModel.setProperty("/valueStateTextplugsSt", "Entered qty is more than available qty");

				} else {
					jsonModel.setProperty("/valueStateplugsSt", "None");
					jsonModel.setProperty("/valueStateTextplugsSt", "");
				}
			} else {
				if (value > jsonModel.getProperty("/plugsAvalQTY")) {
					jsonModel.setProperty("/valueStateplugsVeg", "Error");
					jsonModel.setProperty("/valueStateTextplugsVeg", "Entered qty is more than available qty");

				} else {
					jsonModel.setProperty("/valueStateplugsVeg", "None");
					jsonModel.setProperty("/valueStateTextplugsVeg", "");
				}

			}

			// }

		},

		handlechangeGrowthPhase: function () {
			var jsonModel = this.getOwnerComponent().getModel("jsonModel");
			jsonModel.setProperty("/enableOk", true);
			jsonModel.setProperty("/growthPhaseStickvisible", false);
			jsonModel.setProperty("/plugsAvalQTY", "");
			jsonModel.setProperty("/valueStateplugsVeg", "None");
			jsonModel.setProperty("/valueStateTextplugsVeg", "");
			jsonModel.setProperty("/valueStateplugsSt", "None");
			jsonModel.setProperty("/valueStateTextplugsSt", "");

			var sItems;
			var updateObject;
			var table = this.getView().byId("clonePlannerTable");
			sItems = table.getSelectedIndices();
			var licenseNo = jsonModel.getProperty("/selectedLicense");
			if (sItems.length > 0) {
				updateObject = table.getContextByIndex(sItems).getObject();
				if (!this.changeGrowthPhaseDialog) {
					this.changeGrowthPhaseDialog = sap.ui.xmlfragment("changeGrowthPhaseDialog",
						"com.9b.clonePlanner2.view.fragments.ChangeGrowthPhase", this);
					this.getView().addDependent(this.changeGrowthPhaseDialog);
				}
				if (updateObject.ItemName.search("Clone Cutting") !== -1 || updateObject.ItemName.search("Seeds") !== -1) {
					jsonModel.setProperty("/metrcUIDText", "Package Tag");
					jsonModel.setProperty("/gPhase", "Sticking");
					sap.ui.core.Fragment.byId("changeGrowthPhaseDialog", "newQtyForEntry").setValue(updateObject.Quantity);
				} else if (updateObject.ItemName.search("Clone Sticking") !== -1) {
					jsonModel.setProperty("/gPhase", "Vegetative");
					jsonModel.setProperty("/metrcUIDText", "Package Tag");
					jsonModel.setProperty("/growthPhaseStickvisible", true);

					if (Number(updateObject.Quantity) <= 96 && Number(updateObject.Quantity) > 0) {
						sap.ui.core.Fragment.byId("changeGrowthPhaseDialog", "newQtyForEntry").setValue(updateObject.Quantity);
					} else {
						sap.ui.core.Fragment.byId("changeGrowthPhaseDialog", "newQtyForEntry").setValue(96);
					}

				} else if (updateObject.ItemName.search("Teen") !== -1) {
					jsonModel.setProperty("/gPhase", "Flowering");
					jsonModel.setProperty("/metrcUIDText", "Plant Tag");
					sap.ui.core.Fragment.byId("changeGrowthPhaseDialog", "newQtyForEntry").setValue(updateObject.Quantity);
				}
				var gPhase = sap.ui.core.Fragment.byId("changeGrowthPhaseDialog", "growthPhase");
				var sgPhase = gPhase.getSelectedItem();
				gPhase.fireChange({
					selectedItem: sgPhase
				});

				if (sgPhase.getText() == "Flowering") {
					jsonModel.setProperty("/beggingTag", true);
				} else {
					jsonModel.setProperty("/beggingTag", false);
				}

				var changeGrowthObj = {
					BatchNum: updateObject.BatchNum,
					harvestBatchName: updateObject.MnfSerial,
					SourceUID: updateObject.SourceUID,
					Quantity: updateObject.Quantity,
					ItemName: updateObject.ItemName,
				};

				jsonModel.setProperty("/changeGrowthObj", changeGrowthObj);
				jsonModel.setProperty("/selectedRowGrowthObj", updateObject);
				jsonModel.setProperty("/valueStateChangeGrowth", "None");
				jsonModel.setProperty("/valueStateTextChangeGrowth", "");
				var selectedBinCode = jsonModel.getProperty("/selectedBinCode");
				var selectedWarehouse = jsonModel.getProperty("/selectedWarehouse");
				var selectedAbsEntry = jsonModel.getProperty("/selectedAbsEntry");
				var selKey = selectedWarehouse + "-" + selectedAbsEntry + "-" + selectedBinCode;
				sap.ui.core.Fragment.byId("changeGrowthPhaseDialog", "location").setSelectedKey(selKey);

				// sap.ui.core.Fragment.byId("changeGrowthPhaseDialog", "laborSt").setValue("");
				// sap.ui.core.Fragment.byId("changeGrowthPhaseDialog", "strain").setValue(updateObject.BatchNum);
				// sap.ui.core.Fragment.byId("changeGrowthPhaseDialog", "parentTag").setValue(updateObject.SourceUID);
				//sap.ui.core.Fragment.byId("changeGrowthPhaseDialog", "location").setValue("");

				// sap.ui.core.Fragment.byId("changeGrowthPhaseDialog", "avalQty").setValue(updateObject.Quantity);
				// sap.ui.core.Fragment.byId("changeGrowthPhaseDialog", "harvestBatch").setValue(updateObject.MnfSerial);
				sap.ui.core.Fragment.byId("changeGrowthPhaseDialog", "beggingTag").setSelectedKey("");
				sap.ui.core.Fragment.byId("changeGrowthPhaseDialog", "endTag").setValue("");
				sap.ui.core.Fragment.byId("changeGrowthPhaseDialog", "stickGrowthTag").setSelectedKey("");
				sap.ui.core.Fragment.byId("changeGrowthPhaseDialog", "itemSticking").setSelectedKey("");
				sap.ui.core.Fragment.byId("changeGrowthPhaseDialog", "plugsSt").setValue("");
				sap.ui.core.Fragment.byId("changeGrowthPhaseDialog", "itemCutting").setSelectedKey("");
				sap.ui.core.Fragment.byId("changeGrowthPhaseDialog", "plugsVeg").setValue("");

				// sap.ui.core.Fragment.byId("changeGrowthPhaseDialog", "selItems").setValue(updateObject.ItemName);

				// if(Number(updateObject.Quantity) <= 96 && Number(updateObject.Quantity) > 0){
				// sap.ui.core.Fragment.byId("changeGrowthPhaseDialog", "newQtyForEntry").setValue(updateObject.Quantity);
				// } else {
				// sap.ui.core.Fragment.byId("changeGrowthPhaseDialog", "newQtyForEntry").setValue(96);
				// }

				this.changeGrowthPhaseDialog.open();
				this.loadLocationData();
				this.loadMetrcTags();
				this.changeGrowthItemListSticking();
				this.changeGrowthItemListCutting();
				this.loadCloneItems();
				//		this.loadAllCloneData();
			} else {
				sap.m.MessageToast.show("Please select atleast one batch");
			}
		},

		loadTagsDataInPkg: function (evt) {
			var that = this;
			var jsonModel = this.getOwnerComponent().getModel("jsonModel");
			var licenseNo = jsonModel.getProperty("/selectedLicense");
			jsonModel.setProperty("/ComboBoxBusy", true);
			var metrcUrl = "/tags/v2/package/available?licenseNumber=" + jsonModel.getProperty("/selectedLicense");
			this.callMetricsGETService(metrcUrl, function (itemData) {
				jsonModel.setProperty("/barCodePlantTagData", itemData);

			}, function (error) {
				that.getView().setBusy(false);
				sap.m.MessageToast.show(JSON.stringify(error));
			});
		},

		loadMetrcTags: function () {
			var that = this;
			var jsonModel = this.getOwnerComponent().getModel("jsonModel");
			var licenseNo = jsonModel.getProperty("/selectedLicense");
			jsonModel.setProperty("/ComboBoxBusy", true);
			var metrcUrl = "/tags/v2/plant/available?licenseNumber=" + jsonModel.getProperty("/selectedLicense");
			this.callMetricsGETService(metrcUrl, function (itemData) {
				jsonModel.setProperty("/ComboBoxBusy", false);
				jsonModel.setProperty("/barCodePlantTagData", itemData);

			}, function (error) {
				jsonModel.setProperty("/ComboBoxBusy", false);
				sap.m.MessageToast.show(JSON.stringify(error));
			});
		},
		onSelectPhaseType: function (evt) {
			var type = sap.ui.core.Fragment.byId("changeGrowthPhaseDialog", "growthPhase").getSelectedKey();
			var table = this.getView().byId("clonePlannerTable");
			var sItems = table.getSelectedIndices();
			var updateObject = table.getContextByIndex(sItems).getObject();
			var strainName = updateObject.StrainName;
			var licenseNo, itemType;

			if (type == "Vegetative") {
				sap.ui.core.Fragment.byId("changeGrowthPhaseDialog", "begTag").setVisible(false);
				sap.ui.core.Fragment.byId("changeGrowthPhaseDialog", "endTagField").setVisible(false);
				// itemType = "Immature Plant";
				itemType = "Teen";
			} else if (type == "Flowering") {
				sap.ui.core.Fragment.byId("changeGrowthPhaseDialog", "begTag").setVisible(true);
				sap.ui.core.Fragment.byId("changeGrowthPhaseDialog", "endTagField").setVisible(true);
				itemType = "Cannabis Plant";
			} else if (type == "Sticking") {
				sap.ui.core.Fragment.byId("changeGrowthPhaseDialog", "begTag").setVisible(true);
				sap.ui.core.Fragment.byId("changeGrowthPhaseDialog", "endTagField").setVisible(true);
				itemType = "Clone Sticking";
			}

			var jsonModel = this.getOwnerComponent().getModel("jsonModel");
			var sLicenNo = jsonModel.getProperty("/selectedLicense");
			if (sLicenNo !== undefined) {
				licenseNo = sLicenNo;
			} else if (jsonModel.getProperty("/licenseList").length > 0) {
				licenseNo = jsonModel.getProperty("/licenseList")[0].U_MetrcLicense;
			} else {
				licenseNo = "";
			}

			var itemtoFilter = strainName + " - " + itemType;
			var escapedItemName = itemtoFilter.replace(/'/g, "''");
			//	var filters = "?$filter=U_MetrcLicense eq " + "'" + licenseNo + "' and endswith(ItemName,'Clone')";
			//	var filters = "?$filter=endswith(ItemName,'" + itemType + "')";

			// var filters = "?$filter=contains(ItemName,'" + escapedItemName + "')";

			var filters = "?$filter=ItemName eq '" + escapedItemName + "'";

			filters = filters.replace(/#/g, "%23");
			// filters = filters.replace(/'/g, "%27");
			var fields = "&$select=" + ["ItemName", "ItemsGroupCode", "ItemCode", "U_MCAT", "ProdStdCost"].join();
			jsonModel.setProperty("/ComboBoxBusy", true);
			this.readServiecLayer("/b1s/v2/Items" + filters + fields, function (data1) {
				jsonModel.setProperty("/ComboBoxBusy", false);
				//	sap.ui.core.Fragment.byId("changeGrowthPhaseDialog", "item").setSelectedItem(data1.value[0].ItemName);
				jsonModel.setProperty("/changeGrowthItemList", data1.value);
				sap.ui.core.Fragment.byId("changeGrowthPhaseDialog", "item").setSelectedKey(data1.value[0].ItemCode + "-" + data1.value[0].ProdStdCost);

			});
		},
		loadTagsData: function () {
			var jsonModel = this.getOwnerComponent().getModel("jsonModel");
			var licenseNo = jsonModel.getProperty("/selectedLicense");
			var filters = "?$filter=U_NLFID eq " + "'" + licenseNo + "' and TagStatus eq 'NotUsed' and U_NTGTP eq 'Plant Tag'";
			jsonModel.setProperty("/ComboBoxBusy", true);
			this.readServiecLayer("/b1s/v2/sml.svc/CV_TAGSTATUS" + filters + "&$orderby=U_NMTSN", function (itemData) {
				jsonModel.setProperty("/ComboBoxBusy", false);
				jsonModel.setProperty("/barCodePlantTagData", itemData.value);
			});
		},
		loadPackageTagsData: function () {
			var that = this;
			var jsonModel = this.getOwnerComponent().getModel("jsonModel");
			var licenseNo = jsonModel.getProperty("/selectedLicense");
			jsonModel.setProperty("/ComboBoxBusy", true);
			var metrcUrl = "/tags/v2/package/available?licenseNumber=" + jsonModel.getProperty("/selectedLicense");
			this.callMetricsGETService(metrcUrl, function (itemData) {
				jsonModel.setProperty("/ComboBoxBusy", false);
				jsonModel.setProperty("/packageTagData", itemData);
			}, function (error) {
				that.getView().setBusy(false);
				sap.m.MessageToast.show(JSON.stringify(error));
			});
		},

		newQuantityForEntry: function (evt) {
			var jsonModel = this.getOwnerComponent().getModel("jsonModel");
			var value = evt.getParameter("value");
			var sItems = this.getView().byId("clonePlannerTable").getSelectedIndices();
			var tableQty = this.getView().byId("clonePlannerTable").getContextByIndex(sItems).getObject();
			var vRoom = sap.ui.core.Fragment.byId("changeGrowthPhaseDialog", "growthPhase").getSelectedKey();

			if (Number(value) > tableQty.Quantity) {
				// sap.m.MessageToast.show("Enterted quantity is more than available quantity");
				jsonModel.setProperty("/valueStateChangeGrowth", "Error");
				jsonModel.setProperty("/valueStateTextChangeGrowth", "Qty cannot be more than available qty");

			} else {
				if (vRoom == "Vegetative") {
					if (Number(value) > 96) {
						// sap.m.MessageToast.show("Enterted quantity is more than available quantity");
						jsonModel.setProperty("/valueStateChangeGrowth", "Error");
						jsonModel.setProperty("/valueStateTextChangeGrowth", "Qty cannot be more than 96.");
					} else {
						jsonModel.setProperty("/valueStateChangeGrowth", "None");
						jsonModel.setProperty("/valueStateTextChangeGrowth", "");
					}
				} else {
					jsonModel.setProperty("/valueStateChangeGrowth", "None");
					jsonModel.setProperty("/valueStateTextChangeGrowth", "");
				}
			}

		},

		onChangeGrowthPhaseClose: function () {
			this.changeGrowthPhaseDialog.close();
		},

		onConfirmChangeGrowthPhase: function (oEvent) {
			var licenseNo;
			var that = this;
			var jsonModel = that.getOwnerComponent().getModel("jsonModel");
			oEvent.getSource().setEnabled(false);
			this._busyDialog.open();
			jsonModel.setProperty("/busyTitle", "Hang tight...");
			jsonModel.setProperty(
				"/busyText",
				"We’re working on Changing the growth phase. Please keep this page open until we’re done."
			);

			setTimeout(function () {
				// jsonModel.setProperty("/enableOk", false);
				var sLicenNo = jsonModel.getProperty("/selectedLicense");
				var table = that.getView().byId("clonePlannerTable");
				var changeGrowthObj = jsonModel.getProperty("/changeGrowthObj");
				var vRoom = sap.ui.core.Fragment.byId("changeGrowthPhaseDialog", "growthPhase").getSelectedKey();
				var locationID = sap.ui.core.Fragment.byId("changeGrowthPhaseDialog", "location").getSelectedKey();
				var startTag = sap.ui.core.Fragment.byId("changeGrowthPhaseDialog", "beggingTag").getSelectedKey();
				var itemCode = sap.ui.core.Fragment.byId("changeGrowthPhaseDialog", "item").getSelectedKey().split("-")[0];
				var ProdStdCost = sap.ui.core.Fragment.byId("changeGrowthPhaseDialog", "item").getSelectedKey().split("-")[1];
				var itemName = sap.ui.core.Fragment.byId("changeGrowthPhaseDialog", "item").getSelectedItem().getText();
				// var laborSt = sap.ui.core.Fragment.byId("changeGrowthPhaseDialog", "laborSt").getValue();
				var newQty = sap.ui.core.Fragment.byId("changeGrowthPhaseDialog", "newQtyForEntry").getValue();
				var plusQTY = sap.ui.core.Fragment.byId("changeGrowthPhaseDialog", "plugsSt").getValue();
				var plugsVegqty = sap.ui.core.Fragment.byId("changeGrowthPhaseDialog", "plugsVeg").getValue();
				var BatchNumberplantTag = sap.ui.core.Fragment.byId("changeGrowthPhaseDialog", "stickGrowthTag").getSelectedKey();

				var sItems, locationName = "";
				var updateObject;
				sItems = table.getSelectedIndices();
				updateObject = table.getContextByIndex(sItems).getObject();
				// var locationName = sap.ui.core.Fragment.byId("changeGrowthPhaseDialog", "location").getSelectedItem().getText();
				if (vRoom === "") {
					sap.m.MessageToast.show("Please select growth Phase");
					oEvent.getSource().setEnabled(true);
					that._busyDialog.close();
					return;
				}
				if (newQty == "") {
					sap.m.MessageToast.show("Please enter quantity.");
					oEvent.getSource().setEnabled(true);
					that._busyDialog.close();
					return;
				}
				if (newQty > updateObject.Quantity) {
					sap.m.MessageToast.show("Qty cannot be more than available qty");
					oEvent.getSource().setEnabled(true);
					that._busyDialog.close();
					return;
				}
				if (vRoom === "Vegetative" && Number(newQty) > 96) {
					sap.m.MessageToast.show("Qty cannot be more than 96.");
					oEvent.getSource().setEnabled(true);
					that._busyDialog.close();
					return;
				}

				if (vRoom === "Vegetative" && BatchNumberplantTag == "") {
					sap.m.MessageToast.show("please select the plant tag");
					oEvent.getSource().setEnabled(true);
					that._busyDialog.close();
					return;
				}

				if (vRoom === "Vegetative" && jsonModel.getProperty("/plugsAvalQTY") == "") {
					sap.m.MessageToast.show("please select blocks");
					oEvent.getSource().setEnabled(true);
					that._busyDialog.close();
					return;
				}

				if (vRoom === "Vegetative" && plugsVegqty == "") {
					sap.m.MessageToast.show("please enter no.of blocks");
					oEvent.getSource().setEnabled(true);
					that._busyDialog.close();
					return;
				}

				if (vRoom === "Vegetative" && plugsVegqty > jsonModel.getProperty("/plugsAvalQTY")) {
					sap.m.MessageToast.show("Entered blocks qty is more than available qty");
					// jsonModel.setProperty("/enableOk", true);
					jsonModel.setProperty("/busyView", false);
					that.byId("dynamicPageId").setBusy(false);
					oEvent.getSource().setEnabled(true);
					that._busyDialog.close();
					return;
				}

				if (vRoom === "Sticking" && jsonModel.getProperty("/plugsAvalQTY") == "") {
					sap.m.MessageToast.show("please select plugs");
					oEvent.getSource().setEnabled(true);
					that._busyDialog.close();
					return;
				}

				if (vRoom === "Sticking" && plusQTY == "") {
					sap.m.MessageToast.show("please enter no.of plugs");
					oEvent.getSource().setEnabled(true);
					that._busyDialog.close();
					return;
				}

				if (vRoom === "Sticking" && plusQTY > jsonModel.getProperty("/plugsAvalQTY")) {
					sap.m.MessageToast.show("Entered plugs qty is more than available qty");
					oEvent.getSource().setEnabled(true);
					that._busyDialog.close();
					return;
				}

				if (locationID === "") {
					sap.m.MessageToast.show("Please select location");
					oEvent.getSource().setEnabled(true);
					that._busyDialog.close();
					return;
				}
				if (itemCode === "") {
					sap.m.MessageToast.show("Please select item");
					oEvent.getSource().setEnabled(true);
					that._busyDialog.close();
					return;
				}
				if (vRoom == "Flowering") {
					if (startTag === "") {
						sap.m.MessageToast.show("Please select beginning tag");
						oEvent.getSource().setEnabled(true);
						that._busyDialog.close();
						return;
					}
				}

				if (sItems.length > 0) {
					oEvent.getSource().setEnabled(false);
					var cDate = that.getSystemDate(new Date());
					var batchID = updateObject.BatchNum;
					var tagArray = jsonModel.getProperty("/tagArray");
					var batchUrl = [],
						AbslocationEntry, BinCode;
					//posting to InventoryGenExits when we change growth phase for existing clone
					var BatchNumber = updateObject.BatchNum;
					var ChangeLocationList = jsonModel.getProperty("/ChangeLocationList");

					var rObj = $.grep(ChangeLocationList, function (sLoc) {
						if (sLoc.BinCode && sLoc.BinCode === locationID.replace(locationID.split("-")[0], "").replace("-", "").replace(locationID
								.split(
									"-")[1], "")
							.replace("-", "")) {
							return sLoc;
						}
					});
					locationName = rObj[0].U_MetrcLocation;

					$.each(ChangeLocationList, function (i, obj) {
						if (obj.BinCode && updateObject.BinLocationCode == obj.BinCode) {
							AbslocationEntry = obj.AbsEntry;
							BinCode = obj.BinCode;
						}
					});

					that.readServiecLayer("/b1s/v2/UsersService_GetCurrentUser", function (resP) {
						var metrcData = jsonModel.getProperty("/metrcData");
						if (metrcData && metrcData.U_NACST === "X" && vRoom == "Flowering") {
							var metricPayload = [{
								Name: updateObject.BatchNum,
								Count: newQty, //updateObject.Quantity,
								StartingTag: startTag,
								GrowthPhase: "Flowering",
								NewLocation: locationName,
								GrowthDate: cDate
							}];
							var metrcUrl = "/plantbatches/v2/growthphase?licenseNumber=" + sLicenNo;
							that.callMetricsService(metrcUrl, "POST", metricPayload, function () {
								that.changeGrwothphaseb1calls();
							}, function (error) {
								sap.m.MessageToast.show(JSON.stringify(error));
								oEvent.getSource().setEnabled(true);
								that._busyDialog.close();
							});
						} else if (metrcData && metrcData.U_NACST === "X" && vRoom == "Sticking") {
							var metricPayload = [{
								Label: updateObject.BatchNum,
								Item: updateObject.StrainName + " - " + "Clone Sticking"
							}];
							var metrcUrl = "/packages/v2/item?licenseNumber=" + sLicenNo;
							that.callMetricsService(metrcUrl, "PUT", metricPayload, function () {
								// sap.m.MessageToast.show("Change growth phase completed.");
								// that.changeGrowthToTable(batchUrl);
								that.changeGrwothphaseb1calls();
							}, function (error) {
								that._busyDialog.close();
								sap.m.MessageToast.show(JSON.stringify(error));
								oEvent.getSource().setEnabled(true);

							});
						} else {
							// this.changeGrowthToTable(batchUrl);

							if (jsonModel.getProperty("/growthPhaseStickvisible") == true) {
								that.onChangegrowthphaseCreateplantings();
							} else {
								that.changeGrwothphaseb1calls();
							}
						}
					});

				} else {
					sap.m.MessageToast.show("Please select atleast one batch");
					that._busyDialog.close();
				}

			}, 100);

		},

		changeGrwothphaseb1calls: function () {
			var licenseNo;
			var that = this;
			var jsonModel = this.getOwnerComponent().getModel("jsonModel");
			var sLicenNo = jsonModel.getProperty("/selectedLicense");
			var table = this.getView().byId("clonePlannerTable");
			var vRoom = sap.ui.core.Fragment.byId("changeGrowthPhaseDialog", "growthPhase").getSelectedKey();
			var locationID = sap.ui.core.Fragment.byId("changeGrowthPhaseDialog", "location").getSelectedKey();
			var startTag = sap.ui.core.Fragment.byId("changeGrowthPhaseDialog", "beggingTag").getSelectedKey();
			var itemCode = sap.ui.core.Fragment.byId("changeGrowthPhaseDialog", "item").getSelectedKey().split("-")[0];
			var ProdStdCost = sap.ui.core.Fragment.byId("changeGrowthPhaseDialog", "item").getSelectedKey().split("-")[1];
			var itemName = sap.ui.core.Fragment.byId("changeGrowthPhaseDialog", "item").getSelectedItem().getText();
			// var laborSt = sap.ui.core.Fragment.byId("changeGrowthPhaseDialog", "laborSt").getValue();
			var newQty = sap.ui.core.Fragment.byId("changeGrowthPhaseDialog", "newQtyForEntry").getValue();
			var createPlantBatchNumber = sap.ui.core.Fragment.byId("changeGrowthPhaseDialog", "stickGrowthTag").getSelectedKey();

			var sItems, locationName = "";
			var updateObject, diffQtyDestroy;
			sItems = table.getSelectedIndices();
			updateObject = table.getContextByIndex(sItems).getObject();

			if (newQty < updateObject.Quantity) {
				diffQtyDestroy = true;
			} else {
				diffQtyDestroy = false;
			}

			if (sItems.length > 0) {
				var cDate = that.getSystemDate(new Date());
				var batchID = updateObject.BatchNum;
				var tagArray = jsonModel.getProperty("/tagArray");
				var batchUrl = [],
					AbslocationEntry, BinCode;
				//posting to InventoryGenExits when we change growth phase for existing clone
				var BatchNumber = updateObject.BatchNum;
				var ChangeLocationList = jsonModel.getProperty("/ChangeLocationList");

				var rObj = $.grep(ChangeLocationList, function (sLoc) {
					if (sLoc.BinCode && sLoc.BinCode === locationID.replace(locationID.split("-")[0], "").replace("-", "").replace(locationID.split(
							"-")[1], "")
						.replace("-", "")) {
						return sLoc;
					}
				});
				locationName = rObj[0].U_MetrcLocation;

				$.each(ChangeLocationList, function (i, obj) {
					if (obj.BinCode && updateObject.BinLocationCode == obj.BinCode) {
						AbslocationEntry = obj.AbsEntry;
						BinCode = obj.BinCode;
					}
				});

				if (vRoom == "Flowering") {
					//immature plants
					var payLoadProduction = {
						"ItemNo": itemCode,
						"DistributionRule": "CULT",
						"PlannedQuantity": newQty, //updateObject.Quantity,
						"ProductionOrderType": "bopotSpecial",
						"PostingDate": cDate,
						"DueDate": cDate,
						"Warehouse": updateObject.WhsCode.split("-")[0],
						"Remarks": "Immature Plants - Change Growth Phase",
						"ProductionOrderLines": [{
							"ItemNo": "L04",
							"ItemType": "pit_Resource",
							"PlannedQuantity": newQty, //Number(laborSt),
							"ProductionOrderIssueType": "im_Backflush",
							"Warehouse": updateObject.WhsCode.split("-")[0],
						}, {
							"ItemNo": updateObject.ItemCode,
							"DistributionRule": "CULT",
							"PlannedQuantity": newQty, //updateObject.Quantity,
							"ProductionOrderIssueType": "im_Manual",
							"Warehouse": updateObject.WhsCode.split("-")[0],
						}]
					}

				} else if (vRoom == "Vegetative") {
					var plugsVeg = sap.ui.core.Fragment.byId("changeGrowthPhaseDialog", "plugsVeg").getValue();
					var itemCutting = sap.ui.core.Fragment.byId("changeGrowthPhaseDialog", "itemCutting").getSelectedKey();
					//sticking
					var payLoadProduction = {
						"ItemNo": itemCode,
						"DistributionRule": "NURS",
						"PlannedQuantity": newQty, //updateObject.Quantity,
						"ProductionOrderType": "bopotSpecial",
						"PostingDate": cDate,
						"DueDate": cDate,
						"Warehouse": updateObject.WhsCode.split("-")[0],
						"Remarks": "Immature Plants - Change Growth Phase",
						"ProductionOrderLines": [{
								"ItemNo": "L03", //labour
								"ItemType": "pit_Resource",
								"PlannedQuantity": newQty, //Number(laborSt),
								"ProductionOrderIssueType": "im_Backflush",
								"Warehouse": updateObject.WhsCode.split("-")[0],
							}, {
								"ItemNo": updateObject.ItemCode, // selected item
								"DistributionRule": "NURS",
								"PlannedQuantity": newQty, //updateObject.Quantity,
								"ProductionOrderIssueType": "im_Manual",
								"Warehouse": updateObject.WhsCode.split("-")[0],
							}, {
								"ItemNo": itemCutting, //blocks
								"PlannedQuantity": plugsVeg, //updateObject.Quantity,
								"ProductionOrderIssueType": "im_Backflush",
								"Warehouse": updateObject.WhsCode.split("-")[0],
							}

						]
					}

				} else {
					var plusQTY = sap.ui.core.Fragment.byId("changeGrowthPhaseDialog", "plugsSt").getValue();
					var itemSticking = sap.ui.core.Fragment.byId("changeGrowthPhaseDialog", "itemSticking").getSelectedKey();
					//cuttings
					var payLoadProduction = {
						"ItemNo": itemCode,
						"DistributionRule": "NURS",
						"PlannedQuantity": newQty, //updateObject.Quantity,
						"ProductionOrderType": "bopotSpecial",
						"PostingDate": cDate,
						"DueDate": cDate,
						"Warehouse": updateObject.WhsCode.split("-")[0],
						"Remarks": "Immature Plants - Change Growth Phase",
						"ProductionOrderLines": [{
								"ItemNo": "L02", //labour
								"ItemType": "pit_Resource",
								"PlannedQuantity": newQty, //Number(laborSt),
								"ProductionOrderIssueType": "im_Backflush",
								"Warehouse": updateObject.WhsCode.split("-")[0],
							}, {
								"ItemNo": updateObject.ItemCode, // selected item
								"DistributionRule": "NURS",
								"PlannedQuantity": updateObject.Quantity,
								"ProductionOrderIssueType": "im_Manual",
								"Warehouse": updateObject.WhsCode.split("-")[0],
							}, {
								"ItemNo": itemSticking, //plugs
								"PlannedQuantity": plusQTY, //updateObject.Quantity,
								"ProductionOrderIssueType": "im_Backflush",
								"Warehouse": updateObject.WhsCode.split("-")[0],
							}

						]
					}

				}

				that.updateServiecLayer("/b1s/v2/ProductionOrders", function (res) {
					var docNUM = Number(res.AbsoluteEntry);
					var BaseLine = res;
					// jsonModel.setProperty("/enableOk", false);
					var fisrtPatchCall = {
						"ProductionOrderStatus": "boposReleased",
					};

					batchUrl.push({
						url: "/b1s/v2/ProductionOrders(" + docNUM + ")",
						data: fisrtPatchCall,
						method: "PATCH"
					});

					if (vRoom == "Vegetative") {
						var payLoadInventoryExits = {
							"BPL_IDAssignedToInvoice": jsonModel.getProperty("/sLinObj").U_Branch,
							"Comments": "Immature Plants - Change Growth Phase",
							"DocumentLines": []
						};
						payLoadInventoryExits.DocumentLines.push({
							// "ItemCode": updateObject.ItemCode, //<THIS IS SELECTED ITEM> 
							"WarehouseCode": updateObject.WhsCode.split("-")[0], //updateObject.WhsCode.split("-")[0], // <THIS IS FROM CLONE ROOM>
							"BaseType": 202,
							"BaseEntry": docNUM,
							"BaseLine": 1,

							"Quantity": newQty, //updateObject.Quantity, // <THIS IS THE QTY OF CLONES>
							"BatchNumbers": [{
								"BatchNumber": BatchNumber, // <THIS IS TAG>
								"Quantity": newQty, //updateObject.Quantity, //<THIS IS THE QTY OF CLONES>
								"Location": BinCode, //updateObject.WhsCode, //<THIS IS FROM CLONE ROOM>
								"U_BatAttr3": updateObject.SourceUID, //updateObject.SourceUID, //sourceTag
								"ManufacturerSerialNumber": updateObject.MnfSerial //harvestTag
							}],
							"DocumentLinesBinAllocations": [{
								"BinAbsEntry": Number(AbslocationEntry),
								"Quantity": newQty, //updateObject.Quantity,
								"SerialAndBatchNumbersBaseLine": 0
							}]

						});
						batchUrl.push({
							url: "/b1s/v2/InventoryGenExits",
							data: payLoadInventoryExits,
							method: "POST"
						});

						var payLoadInventoryEntry1 = {
							"BPL_IDAssignedToInvoice": jsonModel.getProperty("/sLinObj").U_Branch,
							"Comments": "Immature Plants - Change Growth Phase",
							"DocumentLines": [{
								// "ItemCode": itemCode, //<THIS IS SELECTED ITEM> 
								"WarehouseCode": locationID.split("-")[0], // <THIS IS FROM CLONE ROOM>
								"BaseType": 202,
								"BaseEntry": docNUM,
								"Quantity": newQty, //updateObject.Quantity, // <THIS IS THE QTY OF CLONES>
								// "UnitPrice": Number(ProdStdCost),
								"BatchNumbers": [{
									"BatchNumber": createPlantBatchNumber, // <THIS IS TAG>
									"Quantity": newQty, //updateObject.Quantity, //<THIS IS THE QTY OF CLONES>
									"Location": locationID.replace(locationID.split("-")[0], "").replace("-", "").replace(locationID.split("-")[1], "").replace(
										"-", ""),
									//<THIS IS FROM CLONE ROOM>
									"U_BatAttr3": BatchNumber, //updateObject.SourceUID, //sourceTag
									"U_Phase": "Immature",
									"ManufacturerSerialNumber": updateObject.MnfSerial, //harvestTag
									"U_LotNumber": updateObject.U_LotNumber,
									"U_IsPackage": "NO"
								}],
								"DocumentLinesBinAllocations": [{
									"BinAbsEntry": Number(locationID.split("-")[1]),
									"Quantity": newQty, //updateObject.Quantity,
									"SerialAndBatchNumbersBaseLine": 0

								}]
							}]
						};
						batchUrl.push({
							url: "/b1s/v2/InventoryGenEntries",
							data: payLoadInventoryEntry1,
							method: "POST"
						});

					} else if (vRoom == "Flowering") {

						var payLoadInventoryExits1 = {
							"BPL_IDAssignedToInvoice": jsonModel.getProperty("/sLinObj").U_Branch,
							"Comments": "Immature Plants - Change Growth Phase",
							"DocumentLines": []
						};
						payLoadInventoryExits1.DocumentLines.push({
							// "ItemCode": updateObject.ItemCode, //<THIS IS SELECTED ITEM>
							"WarehouseCode": updateObject.WhsCode.split("-")[0], // updateObject.WhsCode.split("-")[0], 
							"BaseType": 202,
							"BaseEntry": docNUM,
							"BaseLine": 1,

							"Quantity": newQty, //updateObject.Quantity, // <THIS IS THE QTY OF CLONES>
							"BatchNumbers": [{
								"BatchNumber": BatchNumber, // <THIS IS TAG>
								"Quantity": newQty, //updateObject.Quantity, //<THIS IS THE QTY OF CLONES>
								"Location": BinCode, //updateObject.WhsCode, //<THIS IS FROM CLONE ROOM>
								"U_BatAttr3": updateObject.SourceUID, //sourceTag
								"ManufacturerSerialNumber": updateObject.MnfSerial //harvestTag
							}],
							"DocumentLinesBinAllocations": [{
								"BinAbsEntry": Number(AbslocationEntry),
								"Quantity": newQty, //updateObject.Quantity,
								"SerialAndBatchNumbersBaseLine": 0
							}]

						});
						batchUrl.push({
							url: "/b1s/v2/InventoryGenExits",
							data: payLoadInventoryExits1,
							method: "POST"
						});

						var plantTag;
						//posting to InventoryGenEntries when we change growth phase for newly created records in veg planner
						var payLoadInventoryEntry = {
							"BPL_IDAssignedToInvoice": jsonModel.getProperty("/sLinObj").U_Branch,
							"Comments": "Immature Plants - Change Growth Phase",
							"DocumentLines": [{
								// "ItemCode": itemCode, //<THIS IS SELECTED ITEM> 
								"WarehouseCode": locationID.split("-")[0], // <THIS IS FROM CLONE ROOM>
								"BaseType": 202,
								"BaseEntry": docNUM,
								"Quantity": newQty, //updateObject.Quantity, // <THIS IS THE QTY OF CLONES>
								// "UnitPrice": Number(ProdStdCost),
								"BatchNumbers": [],
								"DocumentLinesBinAllocations": []
							}]
						};
						var payLoadCreate = {};
						$.each(new Array(Number(newQty)), function (i, e) {
							if (tagArray.length > 0) {
								payLoadCreate.U_NPTID = tagArray[i].Label;
								payLoadCreate.U_NPLID = tagArray[i].Label;
								plantTag = tagArray[i].Label;
							} else {
								payLoadCreate.U_NPTID = "";
								payLoadCreate.U_NPLID = "";
								plantTag = "";
							}

							payLoadInventoryEntry.DocumentLines[0].BatchNumbers.push({
								"BatchNumber": plantTag, // <THIS IS TAG>
								"Quantity": 1, //<THIS IS THE QTY OF CLONES>
								"Location": locationID.replace(locationID.split("-")[0], "").replace("-", "").replace(locationID.split("-")[1], "").replace(
									"-", ""),
								//<THIS IS FROM CLONE ROOM>
								"U_Phase": "Flower",
								"U_BatAttr3": updateObject.SourceUID, //sourceTag
								"ManufacturerSerialNumber": updateObject.MnfSerial, //harvestTag
								"U_LotNumber": updateObject.U_LotNumber,
								"U_IsPackage": "NO"
							});

							payLoadInventoryEntry.DocumentLines[0].DocumentLinesBinAllocations.push({
								"BinAbsEntry": Number(locationID.split("-")[1]),
								"Quantity": 1,
								"SerialAndBatchNumbersBaseLine": i
							});

						});
						batchUrl.push({
							url: "/b1s/v2/InventoryGenEntries",
							data: payLoadInventoryEntry,
							method: "POST"
						});
					} else {
						var payLoadInventoryExits = {
							"BPL_IDAssignedToInvoice": jsonModel.getProperty("/sLinObj").U_Branch,
							"Comments": "Immature Plants - Change Growth Phase",
							"DocumentLines": []
						};
						payLoadInventoryExits.DocumentLines.push({
							// "ItemCode": updateObject.ItemCode, //<THIS IS SELECTED ITEM> 
							"WarehouseCode": updateObject.WhsCode.split("-")[0], //updateObject.WhsCode.split("-")[0], // <THIS IS FROM CLONE ROOM>
							"BaseType": 202,
							"BaseEntry": docNUM,
							"BaseLine": 1,

							"Quantity": updateObject.Quantity, // <THIS IS THE QTY OF CLONES>
							"BatchNumbers": [{
								"BatchNumber": BatchNumber, // <THIS IS TAG>
								"Quantity": updateObject.Quantity, //<THIS IS THE QTY OF CLONES>
								"Location": BinCode, //updateObject.WhsCode, //<THIS IS FROM CLONE ROOM>
								"U_BatAttr3": updateObject.SourceUID, //sourceTag
								"ManufacturerSerialNumber": updateObject.MnfSerial //harvestTag
							}],
							"DocumentLinesBinAllocations": [{
								"BinAbsEntry": Number(AbslocationEntry),
								"Quantity": updateObject.Quantity,
								"SerialAndBatchNumbersBaseLine": 0
							}]

						});
						batchUrl.push({
							url: "/b1s/v2/InventoryGenExits",
							data: payLoadInventoryExits,
							method: "POST"
						});

						var payLoadInventoryEntry1 = {
							"BPL_IDAssignedToInvoice": jsonModel.getProperty("/sLinObj").U_Branch,
							"Comments": "Immature Plants - Change Growth Phase",
							"DocumentLines": [{
								// "ItemCode": itemCode, //<THIS IS SELECTED ITEM> 
								"WarehouseCode": locationID.split("-")[0], // <THIS IS FROM CLONE ROOM>
								"BaseType": 202,
								"BaseEntry": docNUM,
								"Quantity": newQty, //updateObject.Quantity, // <THIS IS THE QTY OF CLONES>
								// "UnitPrice": Number(ProdStdCost),
								"BatchNumbers": [{
									"BatchNumber": BatchNumber, // <THIS IS TAG>
									"Quantity": newQty, //updateObject.Quantity, //<THIS IS THE QTY OF CLONES>
									"Location": locationID.replace(locationID.split("-")[0], "").replace("-", "").replace(locationID.split("-")[1], "").replace(
										"-", ""),
									//<THIS IS FROM CLONE ROOM>
									"U_BatAttr3": updateObject.SourceUID, //sourceTag
									"U_Phase": "Immature",
									"ManufacturerSerialNumber": updateObject.MnfSerial, //harvestTag
									"U_LotNumber": updateObject.U_LotNumber,
									"U_IsPackage": "NO"
								}],
								"DocumentLinesBinAllocations": [{
									"BinAbsEntry": Number(locationID.split("-")[1]),
									"Quantity": newQty, //updateObject.Quantity,
									"SerialAndBatchNumbersBaseLine": 0

								}]
							}]
						};
						batchUrl.push({
							url: "/b1s/v2/InventoryGenEntries",
							data: payLoadInventoryEntry1,
							method: "POST"
						});
					}

					var secondPatchCall = {
						"ProductionOrderStatus": "boposClosed",
					};

					batchUrl.push({
						url: "/b1s/v2/ProductionOrders(" + Number(docNUM) + ")",
						data: secondPatchCall,
						method: "PATCH"
					});

					that.changeGrowthToTable(batchUrl, diffQtyDestroy, vRoom);

				}.bind(that), payLoadProduction, "POST");
			}

		},

		changeGrowthToTable: function (batchUrl, diffQtyDestroy, vRoom) {
			var that = this;
			var jsonModel = this.getOwnerComponent().getModel("jsonModel");
			// jsonModel.setProperty("/enableOk", false);
			jsonModel.setProperty("/errorTxt", []);
			this.createBatchCall(batchUrl, function () {
				var errorTxt = jsonModel.getProperty("/errorTxt");
				var errorResponse = jsonModel.getProperty("/errorResponse");
				if (errorResponse == true || errorTxt.length > 0) {
					sap.m.MessageBox.error(errorTxt.join("\n"));
					that._busyDialog.close();
				} else {
					if (diffQtyDestroy == true && vRoom != "Vegetative") {
						// that.changegrowthDiffQtyDestroy();

						jsonModel.setProperty("/busyTitle", "✅ All set!");
						jsonModel.setProperty("/busyText", "Growth phase changed successfully.");

						setTimeout(function () {
							that._busyDialog.close();
						}, 1000);

						that.loadMasterData();
						that.changeGrowthPhaseDialog.close();
						that.byId("clonePlannerTable").clearSelection();
						jsonModel.setProperty("/isSingleSelect", false);

					} else {
						jsonModel.setProperty("/busyTitle", "✅ All set!");
						jsonModel.setProperty("/busyText", "Growth phase changed successfully.");

						setTimeout(function () {
							that._busyDialog.close();
						}, 1000);
						that.loadMasterData();
						that.changeGrowthPhaseDialog.close();
						// sap.m.MessageToast.show("Change growth phase completed.");
						that.byId("clonePlannerTable").clearSelection();
						jsonModel.setProperty("/isSingleSelect", false);
					}
				}
			}, this.changeGrowthPhaseDialog);
		},

		onChangegrowthphaseCreateplantings: function () {
			var that = this;
			var jsonModel = this.getOwnerComponent().getModel("jsonModel");
			var licenseNo = jsonModel.getProperty("/selectedLicense");
			var cPlantingsData = jsonModel.getProperty("/selectedRowGrowthObj");
			var ChangeLocationList = jsonModel.getProperty("/ChangeLocationList");
			var isValidated = true;
			var ItemList = jsonModel.getProperty("/allItemList");
			var BatchNumber = sap.ui.core.Fragment.byId("changeGrowthPhaseDialog", "stickGrowthTag").getSelectedKey();
			var newQty = sap.ui.core.Fragment.byId("changeGrowthPhaseDialog", "newQtyForEntry").getValue();
			var locationID = sap.ui.core.Fragment.byId("changeGrowthPhaseDialog", "location").getSelectedKey();
			var isValidate = true;
			if (BatchNumber == "") {
				sap.m.MessageToast.show("please select the plant tag");
				isValidate = false;
				that._busyDialog.close();
			}

			if (isValidate) {

				var AbslocationEntry, BinCode, ProdStdCost, UOMCode, locationName, batchUrl = [],
					metricPayload = [];
				// $.each(cPlantingsData, function (i, sObj) {

				var sourceTag = cPlantingsData.BatchNum;
				var harvestTag = cPlantingsData.MnfSerial;
				var qty = newQty;
				var itemCode = cPlantingsData.ItemCode;
				var itemName = cPlantingsData.ItemName;
				var fromLoc = cPlantingsData.WhsCode;
				var strainName = cPlantingsData.StrainName;
				var oDateFormat = DateFormat.getDateInstance({
					pattern: "yyyy-MM-dd"
				});
				// Format the date
				// var cDate = oDateFormat.format(sObj.U_NCRDT_P);
				var rObj = $.grep(ChangeLocationList, function (sLoc) {
					if (sLoc.BinCode && sLoc.BinCode === locationID.replace(locationID.split("-")[0], "").replace("-", "").replace(locationID.split(
							"-")[1], "")
						.replace("-", "")) {
						return sLoc;
					}
				});
				locationName = rObj[0].U_MetrcLocation;
				var absEntry = rObj[0].AbsEntry;
				var bincodeEntry = rObj[0].BinCode;
				var whsCoceEntry = rObj[0].Warehouse;

				$.each(ChangeLocationList, function (i, obj) {
					if (obj.BinCode && cPlantingsData.BinLocationCode == obj.BinCode) {
						AbslocationEntry = obj.AbsEntry;
						BinCode = obj.BinCode;
					}
				});

				$.each(ItemList, function (j, k) {
					if (k.ItemName && itemName && k.ItemName == itemName) {
						ProdStdCost = k.ProdStdCost;
						UOMCode = k.InventoryUOM;
						return false;
					}
				});

				var metricPayloadOBJ = {
					PackageLabel: sourceTag,
					PackageAdjustmentUnitOfMeasureName: UOMCode, //"Each",
					PlantBatchName: BatchNumber,
					PlantBatchType: "Clone",
					PlantCount: qty,
					LocationName: locationName,
					StrainName: strainName,
					PlantedDate: that.getSystemDate(), //cDate, //that.getSystemDate(),
					UnpackagedDate: that.getSystemDate() //cDate, //that.getSystemDate()
				};
				metricPayload.push(metricPayloadOBJ);
				// });
				// jsonModel.setProperty("/enableOk", false);
				var metrcData = jsonModel.getProperty("/metrcData");
				if (metrcData && metrcData.U_NACST === "X") {
					var metrcUrl = "/packages/v2/plantings?licenseNumber=" + licenseNo;
					//that.createPlantingDialog.setBusy(true);
					that.callMetricsService(metrcUrl, "POST", metricPayload, function () {
						that.changeGrwothphaseb1calls();
					}, function (error) {
						that._busyDialog.close();
						sap.m.MessageToast.show(JSON.stringify(error));
					});

				} else {
					that.changeGrwothphaseb1calls();
				}
			}

		},

		changegrowthDiffQtyAdjust: function () {

			var that = this;
			var jsonModel = this.getOwnerComponent().getModel("jsonModel");
			var licenseNo = jsonModel.getProperty("/selectedLicense");
			var cPlantingsData = jsonModel.getProperty("/selectedRowGrowthObj");
			var ChangeLocationList = jsonModel.getProperty("/ChangeLocationList");
			var isValidated = true;
			var ItemList = jsonModel.getProperty("/allItemList");
			var BatchNumber = sap.ui.core.Fragment.byId("changeGrowthPhaseDialog", "stickGrowthTag").getSelectedKey();
			var newQty = sap.ui.core.Fragment.byId("changeGrowthPhaseDialog", "newQtyForEntry").getValue();
			var locationID = sap.ui.core.Fragment.byId("changeGrowthPhaseDialog", "location").getSelectedKey();
			var metrcData = jsonModel.getProperty("/metrcData");
			var metricPayload = [];
			var metrcPayLoadObj;

			var qty = Number(Number(cPlantingsData.Quantity) - Number(newQty)).toFixed(2);
			var rObj = $.grep(ItemList, function (item) {
				if (item.ItemName && cPlantingsData.ItemName == item.ItemName) {
					return item;
				}
			});

			if (metrcData && metrcData.U_NACST === "X") {

				metrcPayLoadObj = {
					Label: cPlantingsData.BatchNum,
					Quantity: -Number(qty),
					UnitOfMeasure: rObj[0].InventoryUOM,
					AdjustmentReason: "Damage",
					AdjustmentDate: that.getSystemDate(),
					ReasonNote: "Immature plants - change growth phase (adjust)"
				};
				metricPayload.push(metrcPayLoadObj);

				var metrcUrl = "/packages/v2/adjust?licenseNumber=" + jsonModel.getProperty("/selectedLicense");
				that.callMetricsService(metrcUrl, "POST", metricPayload, function () {
					that._busyDialog.close();
					that.loadMasterData();
					that.changeGrowthPhaseDialog.close();
					sap.m.MessageToast.show("Change growth phase completed.");
					that.byId("clonePlannerTable").clearSelection();
					jsonModel.setProperty("/isSingleSelect", false);

				}, function (error) {
					that._busyDialog.close();
					sap.m.MessageToast.show(JSON.stringify(error));
				});
			}
		},

		// adjusttoTable: function (qty, rObj) {
		// 	var that = this;
		// 	var jsonModel = this.getOwnerComponent().getModel("jsonModel");
		// 	var licenseNo = jsonModel.getProperty("/selectedLicense");
		// 	var cPlantingsData = jsonModel.getProperty("/selectedRowGrowthObj");
		// 	var ChangeLocationList = jsonModel.getProperty("/ChangeLocationList");
		// 	var AbslocationEntry, BinCode;
		// 	$.each(ChangeLocationList, function (i, obj) {
		// 		if (cPlantingsData.BinLocationCode == obj.BinCode) {
		// 			AbslocationEntry = obj.AbsEntry;
		// 			BinCode = obj.BinCode;
		// 		}
		// 	});

		// 	var payLoadInventoryExit = {
		// 		"BPL_IDAssignedToInvoice": jsonModel.getProperty("/sLinObj").U_Branch,
		// 		"Comments": "Immature plants - change growth phase (adjust)",
		// 		"DocumentLines": []
		// 	};

		// 	payLoadInventoryExit.DocumentLines.push({
		// 		"ItemCode": cPlantingsData.ItemCode,
		// 		"WarehouseCode": cPlantingsData.WhsCode,
		// 		"Quantity": Number(qty),
		// 		"BatchNumbers": [{
		// 			"BatchNumber": cPlantingsData.BatchNum, // <THIS IS TAG>
		// 			"Quantity": Number(qty), //<THIS IS THE QTY OF CLONES>
		// 			"Location": BinCode, //<THIS IS FROM CLONE ROOM>
		// 			"U_BatAttr3": cPlantingsData.SourceUID, //sourceTag
		// 			"ManufacturerSerialNumber": cPlantingsData.MnfSerial //harvestTag
		// 		}],
		// 		"DocumentLinesBinAllocations": [{
		// 			"BinAbsEntry": Number(AbslocationEntry),
		// 			"Quantity": Number(qty),
		// 			"SerialAndBatchNumbersBaseLine": 0
		// 		}]
		// 	});

		// 	that.updateServiecLayer("/b1s/v2/InventoryGenExits", function (resExit, sDataExit) {

		// 	}, payLoadInventoryExit, "POST");

		// },

		/***	changegrowthDiffQtyDestroy: function () {
				var jsonModel = this.getOwnerComponent().getModel("jsonModel");
				var metrcData = jsonModel.getProperty("/metrcData");
				var table = this.getView().byId("clonePlannerTable");
				var changeGrowthDestroyData = jsonModel.getProperty("/changeGrowthDestroyData");
				var sItems = table.getSelectedIndices();
				var updateObject = table.getContextByIndex(sItems).getObject();
				var newQty = sap.ui.core.Fragment.byId("changeGrowthPhaseDialog", "newQtyForEntry").getValue();
				var metricPayload = [];
				var that = this;
				var sObj, WasteMethod, Materialused, Reason, Notes;

				$.each(JSON.parse(changeGrowthDestroyData), function (i, sobj) {
					if (sobj.key == "Waste Method") {
						WasteMethod = sobj.text;
					} else if (sobj.key == "Material used") {
						Materialused = sobj.text;
					} else if (sobj.key == "Reason") {
						Reason = sobj.text;
					} else if (sobj.key == "Notes") {
						Notes = sobj.text;
					}

				});

				var payLoadCreate = {
					U_NPQTY: Number(updateObject.Quantity) - Number(newQty), // destroy quantity
					U_NDTRS: Reason,
					U_NNOTE: Notes, // destroy note
					U_NCLPL: "CLONES", //clone or planr
					U_NPHSE: "CLONES", //phase
					U_NWTUM: "Pounds",
					U_NWTMT: WasteMethod,
					U_NMTUS: Materialused,
					U_NLCNM: updateObject.BinLocationCode, //location
					U_NCRDT: that.getSystemDate(),
					U_NLFID: updateObject.U_MetrcLicense, //license no
					U_NPLID: updateObject.BatchNum, //plant id
					//U_NSTNM: sObj.U_NSTNM, //strain name
					U_NPBID: updateObject.BatchNum, //batch Id 
				};

				if (metrcData && metrcData.U_NACST === "X") {
					var metricObj = {
						PlantBatch: updateObject.BatchNum,
						Count: Number(updateObject.Quantity) - Number(newQty),
						WasteMethodName: WasteMethod,
						WasteMaterialMixed: Materialused,
						WasteReasonName: Reason,
						ReasonNote: Notes,
						WasteWeight: 1,
						WasteUnitOfMeasure: "Pounds",
						ActualDate: that.getSystemDate()
					};
					metricPayload.push(metricObj);

					var metrcUrl = "/plantbatches/v2/?licenseNumber=" + jsonModel.getProperty("/selectedLicense");
					that.callMetricsService(metrcUrl, "POST", metricPayload, function () {
						that.changeGrowthPhaseDialog.setBusy(false);
						sap.m.MessageToast.show("METRC sync completed successfully");

						that.updateServiecLayer("/b1s/v2/NDRPL", function () {
							that.loadMasterData();
							that.changeGrowthPhaseDialog.close();
							that.changeGrowthPhaseDialog.setBusy(false);
							sap.m.MessageToast.show("Change growth phase completed.");
							that.byId("clonePlannerTable").clearSelection();
							jsonModel.setProperty("/isSingleSelect", false);
						}.bind(that), payLoadCreate, "POST");

					}, function (error) {
						that.changeGrowthPhaseDialog.setBusy(false);
						sap.m.MessageToast.show(JSON.stringify(error));
					});

				}
			},  ***/

		/***method end for change growth phase***/
		handleCreatePackage: function () {
			var jsonModel = this.getOwnerComponent().getModel("jsonModel");
			jsonModel.setProperty("/enablePackage", true);
			var selectedBinCode = jsonModel.getProperty("/selectedBinCode");
			var selectedWarehouse = jsonModel.getProperty("/selectedWarehouse");
			var selectedAbsEntry = jsonModel.getProperty("/selectedAbsEntry");
			var selKey = selectedWarehouse + "-" + selectedAbsEntry + "-" + selectedBinCode;
			var sItems;
			var updateObject;
			var table = this.getView().byId("clonePlannerTable");
			sItems = table.getSelectedIndices();
			var licenseNo = jsonModel.getProperty("/selectedLicense");
			if (sItems.length > 0) {
				updateObject = table.getContextByIndex(sItems).getObject();
				var METRCLocCalls;
				if (updateObject.ItemName.includes("Clone") == true || updateObject.ItemName.includes("Seed") == true) {

					updateObject.METRCLocCalls = "CLONE";
				} else {
					updateObject.METRCLocCalls = "TEEN";
				}

				if (!this.createPackageDialog) {
					this.createPackageDialog = sap.ui.xmlfragment("createPackageDialog",
						"com.9b.clonePlanner2.view.fragments.CreatePackage", this);
					this.getView().addDependent(this.createPackageDialog);
				}
				sap.ui.core.Fragment.byId("createPackageDialog", "strain").setValue(updateObject.BatchNum);
				sap.ui.core.Fragment.byId("createPackageDialog", "harvestBatch").setValue(updateObject.MnfSerial);
				sap.ui.core.Fragment.byId("createPackageDialog", "parentTag").setValue(updateObject.SourceUID);
				sap.ui.core.Fragment.byId("createPackageDialog", "item").setValue(updateObject.ItemName);
				sap.ui.core.Fragment.byId("createPackageDialog", "location").setSelectedKey(selKey);
				sap.ui.core.Fragment.byId("createPackageDialog", "pTag").setSelectedKey();
				this.createPackageDialog.open();
				this.loadCloneItems();
				this.loadSelectedItemCall(updateObject.ItemCode);
				this.loadPackageTagsData();
			} else {
				sap.m.MessageToast.show("Please select atleast one batch");
			}
		},
		onCreatePackageClose: function () {
			this.createPackageDialog.close();
		},
		confirmCreatePackage: function () {
			var jsonModel = this.getOwnerComponent().getModel("jsonModel");
			jsonModel.setProperty("/enablePackage", false);
			var that = this;
			var batchID = sap.ui.core.Fragment.byId("createPackageDialog", "pTag").getSelectedKey();
			if (batchID === "") {
				sap.m.MessageToast.show("Please select package tag");
				jsonModel.setProperty("/enablePackage", true);
				return;
			}
			var sItems;
			var sObj;
			var table = this.getView().byId("clonePlannerTable");
			sItems = table.getSelectedIndices();
			sObj = table.getContextByIndex(sItems).getObject();
			var cDate = this.getSystemDate();
			var licenseNo = jsonModel.getProperty("/selectedLicense");
			var ChangeLocationList = jsonModel.getProperty("/ChangeLocationList");
			var locationID = sap.ui.core.Fragment.byId("createPackageDialog", "location").getSelectedKey();
			var batchUrl = [],
				AbslocationEntry, BinCode, WarehouseCode;
			var itemArray = [];
			var ProdStdCost, UOMCode;
			// var cloneItemList = jsonModel.getProperty("/cloneItemList");
			var cloneItemList = jsonModel.getProperty("/selectedItemCall");
			$.each(cloneItemList, function (j, k) {
				if (k.ItemCode && sObj.ItemCode == k.ItemCode) {
					ProdStdCost = k.ProdStdCost;
					UOMCode = k.InventoryUOM;
				}
			});
			$.each(ChangeLocationList, function (i, obj) {
				if (sObj.BinLocationCode.toLowerCase() == obj.BinCode.toLowerCase()) {
					AbslocationEntry = obj.AbsEntry;
					BinCode = obj.BinCode;
					WarehouseCode = obj.Warehouse;
				}
			});
			var rObj = $.grep(ChangeLocationList, function (sLoc) {
				if (sLoc.BinCode === locationID.replace(locationID.split("-")[0], "").replace("-", "").replace(locationID.split("-")[1], "")
					.replace("-", "")) {
					return sLoc;
				}
			});
			var locationName = rObj[0].U_MetrcLocation;
			$.each(sItems, function (i, e) {
				var qty = 0;
				//posting to inventory genExits
				var BatchNumber = batchID;
				var quantity = Number(sObj.Quantity).toFixed(2);
				var payLoadInventoryExits = {
					"BPL_IDAssignedToInvoice": jsonModel.getProperty("/sLinObj").U_Branch,
					"Comments": "Immature Plants - Create Packages",
					"DocumentLines": []
				};
				payLoadInventoryExits.DocumentLines.push({
					"ItemCode": sObj.ItemCode,
					"WarehouseCode": sObj.WhsCode.split("-")[0], //sObj.WhsCode.split("-")[0],
					"Quantity": quantity,
					"CostingCode": "NURS",
					"BatchNumbers": [{
						"BatchNumber": sObj.BatchNum, // <THIS IS TAG>
						"Quantity": quantity, //<THIS IS THE QTY OF CLONES>
						"Location": BinCode, //sObj.WhsCode, //<THIS IS FROM CLONE ROOM>
						"U_BatAttr3": sObj.SourceUID, //source UID
						"ManufacturerSerialNumber": sObj.MnfSerial //harvest name
					}],
					"DocumentLinesBinAllocations": [{
						"BinAbsEntry": Number(AbslocationEntry),
						"Quantity": quantity,
						"SerialAndBatchNumbersBaseLine": 0
					}]
				});
				batchUrl.push({
					url: "/b1s/v2/InventoryGenExits",
					data: payLoadInventoryExits,
					method: "POST"
				});
				//posting to inventory genEntry after create package
				var payLoadInventory = {
					"BPL_IDAssignedToInvoice": jsonModel.getProperty("/sLinObj").U_Branch,
					"Comments": "Immature Plants - Create Packages",
					"DocumentLines": []
				};
				payLoadInventory.DocumentLines.push({
					"ItemCode": sObj.ItemCode,
					"WarehouseCode": WarehouseCode,
					"Quantity": quantity,
					"UnitPrice": ProdStdCost,
					"CostingCode": "NURS",
					"BatchNumbers": [{
						"BatchNumber": BatchNumber, // <THIS IS TAG>
						"Quantity": quantity, //<THIS IS THE QTY OF CLONES>
						// "Location": BinCode, //sObj.WhsCode, //<THIS IS FROM CLONE ROOM>
						"Location": locationID.replace(locationID.split("-")[0], "").replace("-", "").replace(locationID.split("-")[1], "").replace(
							"-", ""),
						"U_BatAttr3": sObj.SourceUID, //source UID
						"ManufacturerSerialNumber": sObj.MnfSerial, //harvest name
						"U_LotNumber": sObj.U_LotNumber,
						"U_IsPackage": "YES",
						"U_Phase": "Package"
					}],
					"DocumentLinesBinAllocations": [{
						"BinAbsEntry": Number(locationID.split("-")[1]),
						"Quantity": quantity,
						"SerialAndBatchNumbersBaseLine": 0
					}]
				});
				batchUrl.push({
					url: "/b1s/v2/InventoryGenEntries",
					data: payLoadInventory,
					method: "POST"
				});
			});
			this._busyDialog.open();
			jsonModel.setProperty("/busyTitle", "Hang tight...");
			jsonModel.setProperty(
				"/busyText",
				"We’re working on Create Packages. Please keep this page open until we’re done."
			);
			var metrcData = jsonModel.getProperty("/metrcData");
			that.readServiecLayer("/b1s/v2/UsersService_GetCurrentUser", function (resP) {
				if (metrcData && metrcData.U_NACST === "X") {
					var metricPayload, metrcUrl;
					if (sObj.METRCLocCalls == "TEEN") {
						metrcUrl = "/plantbatches/v2/packages?licenseNumber=" + licenseNo;
						metricPayload = [{
							PlantBatch: sObj.BatchNum,
							Count: sObj.Quantity,
							Location: locationName, //sObj.U_MetrcLocation,
							Item: sObj.ItemName,
							Tag: batchID,
							Note: "",
							ActualDate: that.getSystemDate()
						}];
					} else {
						metrcUrl = "/packages/v2/?licenseNumber=" + licenseNo;
						metricPayload = [{
							Tag: batchID,
							Location: locationName, //sObj.U_MetrcLocation,
							Item: sObj.ItemName, //sObj.ItemName,
							Quantity: Number(sObj.Quantity),
							UnitOfMeasure: UOMCode,
							// PatientLicenseNumber: null,
							Note: "Immature plants - create package",
							// IsProductionBatch: false,
							// IsDonation: false,
							// ProductRequiresRemediation: false,
							// UseSameItem: false,
							ActualDate: that.getSystemDate(),
							Ingredients: [{
								Package: sObj.BatchNum,
								Quantity: Number(sObj.Quantity),
								UnitOfMeasure: UOMCode
							}]
						}];
					}

					that.callMetricsService(metrcUrl, "POST", metricPayload, function () {
						//that.createPackageDialog.setBusy(false);
						that.createPackageToTable(batchUrl);
					}, function (error) {
						//that.createPackageDialog.setBusy(false);
						that._busyDialog.close();
						jsonModel.setProperty("/enablePackage", true);
						sap.m.MessageToast.show(JSON.stringify(error));
					});
				} else {
					that.createPackageToTable(batchUrl);
				}
			});
		},
		createPackageToTable: function (batchUrl) {
			var that = this;
			var jsonModel = this.getOwnerComponent().getModel("jsonModel");
			jsonModel.setProperty("/errorTxt", []);
			//that.createPackageDialog.setBusy(true);
			this.createBatchCall(batchUrl, function () {
				//that.createPackageDialog.setBusy(false);
				var errorTxt = jsonModel.getProperty("/errorTxt");
				if (errorTxt.length > 0) {
					sap.m.MessageBox.error(errorTxt.join("\n"));
					jsonModel.setProperty("/enablePackage", true);
					that._busyDialog.close();
				} else {
					jsonModel.setProperty("/enablePackage", true);
					jsonModel.setProperty("/busyTitle", "✅ All set!");
					jsonModel.setProperty("/busyText", "Package created successfullly");
					setTimeout(function () {
						that._busyDialog.close();
					}, 1000);
					that.createPackageDialog.close();
					that.byId("clonePlannerTable").clearSelection();
					jsonModel.setProperty("/isSingleSelect", false);
					that.loadMasterData();
				}

			}, this.createPackageDialog);
		},

		receiveClones: function () {
			if (!this.receiveClone) {
				this.receiveClone = sap.ui.xmlfragment("recClone", "com.9b.clonePlanner2.view.fragments.ReceiveClone", this);
				this.getView().addDependent(this.receiveClone);
			}
			this.cleaReceiveCloneData();
			this.receiveClone.open();
			//	this.loadAllCloneData();
			var jsonModel = this.getOwnerComponent().getModel("jsonModel");
			//var filters7 = "?$filter= ItemsGroupCode eq 137 and U_MCAT eq 'Immature Plant'";
			var filters7 =
				"?$filter= ItemsGroupCode eq 137 or ItemsGroupCode eq 132 and U_MCAT eq 'Immature Plant' or U_MCAT eq 'Clone - Cutting'";
			var fields7 = "&$select=" + ["ItemName", "ItemsGroupCode", "ItemCode", "U_MCAT", "ProdStdCost"].join();
			this.readServiecLayer("/b1s/v2/Items" + filters7 + fields7, function (data) {
				jsonModel.setProperty("/itemReceiveList", data.value);
			});
		},
		cleaReceiveCloneData: function () {
			var jsonModel = this.getOwnerComponent().getModel("jsonModel");
			var cCloneObj = {
				sCloneType: "MO",
				sMotherPlant: "",
				sDate: new Date(),
				sLocation: "",
				sQty: "",
				sStrain: "",
				pTag: "",
				sTag: "",
				hTag: "",
				sItem: ""
			};
			jsonModel.setProperty("/rCloneData", cCloneObj);
		},
		cancelReceiveClone: function () {
			this.receiveClone.close();
		},
		createReceiveClones: function () {
			var that = this;
			var jsonModel = this.getOwnerComponent().getModel("jsonModel");
			var licenseNo = jsonModel.getProperty("/selectedLicense");
			var rCloneData = jsonModel.getProperty("/rCloneData");
			var date = jsonModel.getProperty("/rCloneData/sDate");
			var selObj, createdate, qty, sourceName, sStrain, strain;
			var packageTag = sap.ui.core.Fragment.byId("recClone", "packageTag").getValue();
			var sourceTag = sap.ui.core.Fragment.byId("recClone", "sourceTag").getValue();
			var harvestTag = sap.ui.core.Fragment.byId("recClone", "harvestBatch").getValue();
			var quantity = sap.ui.core.Fragment.byId("recClone", "eQty").getValue();
			var valueState = sap.ui.core.Fragment.byId("recClone", "eQty").getValueState();
			var item = sap.ui.core.Fragment.byId("recClone", "item").getSelectedItem().getText();
			var itemCode = sap.ui.core.Fragment.byId("recClone", "item").getSelectedKey();
			var locationID = sap.ui.core.Fragment.byId("recClone", "location").getSelectedKey();
			var locationName = sap.ui.core.Fragment.byId("recClone", "location").getSelectedItem().getText();
			if (valueState === "Error") {
				sap.ui.core.Fragment.byId("recClone", "eQty").focus();
				return;
			}
			createdate = rCloneData.sDate;
			qty = Number(rCloneData.sQty);
			if (qty === "" || qty === 0) {
				sap.m.MessageToast.show("Please enter quantity");
				return;
			}
			if (isNaN(qty)) {
				sap.m.MessageToast.show("Please enter numeric value only");
				return;
			}
			if (date === " " || date === null || date === undefined) {
				sap.m.MessageToast.show("Please select date");
				return;
			}
			if (locationID === "") {
				sap.m.MessageToast.show("Please select location");
				return;
			}
			var cloneData = jsonModel.getProperty("/allCloneData");
			var cDate;
			if (createdate !== null) {
				cDate = this.getSystemDate(createdate);
			} else {
				cDate = this.getSystemDate(new Date());
			}
			var batchID = packageTag;
			var payLoadSL;
			payLoadSL = {
				U_NIPLT: batchID, //package tag
				U_NITEM: item, //item name
				U_NITCD: itemCode, //itemCode
				U_NPLBC: sourceTag, //source tag
				U_NHBID: harvestTag,
				U_NLCNM: locationName, //location name
				U_NCRDT: cDate, //Clone Created Date
				U_NVQTY: qty, //Clone Available Quantity
				U_NLOCD: locationID,
				U_NCPST: "X",
				U_NLFID: licenseNo
			};
			that.updateServiecLayer("/b1s/v2/NKNMT", function (responseSL) {
				that.receiveClone.close();
				if (responseSL && responseSL.U_NIPLT) {
					that.successHandler("Receive Clone ", responseSL.U_NIPLT);
				}
				that.loadMasterData();
			}, payLoadSL, "POST", this.receiveClone);
		},
		valueHelpLocation: function (evt) {
			var sValue = evt.getSource().getValue();
			if (!sValue) {
				sValue = ".";
			}
			evt.getSource().setValue(sValue);
			evt.getSource().fireSuggest({
				suggestValue: sValue
			});
		},
		onSearchLicense: function (evt) {
			var oItem = evt.getParameter("suggestionItem");
			var jsonModel = this.getOwnerComponent().getModel("jsonModel");
			if (oItem) {
				var sObj = oItem.getBindingContext("jsonModel").getObject();
				jsonModel.setProperty("/sLinObj", sObj);
				jsonModel.setProperty("/selectedLicense", sObj.U_MetrcLicense);
				jsonModel.setProperty("/selectedLocation", sObj.U_MetrcLocation);
				jsonModel.setProperty("/selectedBinCode", sObj.BinCode);
				jsonModel.setProperty("/selectedWarehouse", sObj.Warehouse);
				jsonModel.setProperty("/selectedAbsEntry", sObj.AbsEntry);
				this.loadMasterData();
				this.loadLocationData();
			} else if (evt.getParameter("clearButtonPressed")) {
				evt.getSource().fireSuggest();

			}
		},

		onSuggestLocation: function (event) {
			this.oSF = this.getView().byId("locDropDown");
			var sValue = event.getParameter("suggestValue"),
				aFilters = [];
			if (sValue) {
				aFilters = [
					new Filter([
						new Filter("BinCode", function (sText) {
							return (sText || "").toUpperCase().indexOf(sValue.toUpperCase()) > -1;
						}),
						new Filter("U_MetrcLicense", function (sDes) {
							return (sDes || "").toUpperCase().indexOf(sValue.toUpperCase()) > -1;
						})
					], false)
				];
			}

			this.oSF.getBinding("suggestionItems").filter(aFilters);
			this.oSF.suggest();
		},

		/** code for adjust start**/
		handleAdjust: function () {
			var that = this;
			var jsonModel = this.getOwnerComponent().getModel("jsonModel");
			var sItems;
			//this.loadLocationsDataInPkg();
			var table = this.getView().byId("clonePlannerTable");
			sItems = table.getSelectedIndices();
			this.loadReqItems().then((allItemList) => {
				jsonModel.setProperty("/allItemList", allItemList);
				if (sItems.length > 0) {
					if (!that.adjustQtyDialog) {
						that.adjustQtyDialog = sap.ui.xmlfragment("adjustQty", "com.9b.clonePlanner2.view.fragments.AdjustQuantity",
							that);
						that.getView().addDependent(that.adjustQtyDialog);
					}

					that.adjustQtyDialog.open();
					var batches = [];
					$.each(sItems, function (i, e) {
						var updateObject;
						updateObject = table.getContextByIndex(e).getObject();
						updateObject.NOTES = "";
						updateObject.AQTY = "";
						updateObject.NEWQTY = "";
						updateObject.REASON = "";
						updateObject.SNO = "#" + (i + 1);
						var dryCanGrpItem = $.grep(allItemList, function (e) {
							if (updateObject.ItemName == e.ItemName) {
								return e;
							}
						});
						if (dryCanGrpItem.length > 0) {
							updateObject.UOMCode = dryCanGrpItem[0].InventoryUOM;
						}
						batches.push(updateObject);
					});
				} else {
					sap.m.MessageToast.show("Please select a batch");
				}

				jsonModel.setProperty("/temREASON", "");
				jsonModel.setProperty("/temNOTES", "");
				jsonModel.setProperty("/batches", batches);
			});
			that.loadMetrcWasteReasons();

		},
		adjustQuantity: function (evt) {
			var sObj = evt.getSource().getBindingContext("jsonModel").getObject();
			var aQty = sObj.Quantity;
			var sQty = evt.getParameter("value");
			if (Number(sQty) + Number(aQty) < 0) {
				sap.m.MessageToast.show("Adjust Quantity is Less than Available Quantity");
			} else {
				sObj.NEWQTY = Number(aQty) + (Number(sQty));
			}
		},
		// loadLocationsDataInPkg: function (evt) {
		// 	var jsonModel = this.getView().getModel("jsonModel");
		// 	var licenseNo = jsonModel.getProperty("/selectedLicense");
		// 	var filters = "?$filter=U_MetrcLicense eq " + "'" + licenseNo + "' and not(startswith(BinCode,'LIC'))";
		// 	var fields = "&$select=" + ["U_MetrcLicense", "U_MetrcLocation", "Sublevel2", "BinCode", "AbsEntry", "Warehouse"].join();
		// 	jsonModel.setProperty("/ComboBoxBusy", true);
		// 	this.readServiecLayer("/b1s/v2/BinLocations" + filters + fields, function (data) {
		// 		if (data.value.length > 0) {
		// 			jsonModel.setProperty("/ComboBoxBusy", false);
		// 			jsonModel.setProperty("/harvestLocData", data.value);
		// 		} else {
		// 			jsonModel.setProperty("/ComboBoxBusy", false);
		// 			jsonModel.setProperty("/harvestLocData", []);
		// 		}
		// 	});
		// },

		loadMetrcWasteReasons: function () {
			var that = this;
			var jsonModel = this.getOwnerComponent().getModel("jsonModel");
			var licenseNo = jsonModel.getProperty("/selectedLicense");
			jsonModel.setProperty("/mComboBoxBusy", true);
			var metrcUrl = "/packages/v2/adjust/reasons?licenseNumber=" + jsonModel.getProperty("/selectedLicense");
			this.callMetricsGETService(metrcUrl, function (itemData) {
				jsonModel.setProperty("/mComboBoxBusy", false);
				jsonModel.setProperty("/metrcReasons", itemData.Data);
			}, function (error) {
				that.getView().setBusy(false);
				sap.m.MessageToast.show(JSON.stringify(error));
			});
		},
		onAdjustDelete: function (evt) {
			var jsonModel = this.getView().getModel("jsonModel");
			var batches = jsonModel.getProperty("/batches");
			var sIndex = evt.getSource().getParent().getParent().indexOfItem(evt.getSource().getParent());
			batches.splice(sIndex, 1);
			jsonModel.setProperty("/batches", batches);
		},
		onAdjustTemApply: function () {
			var jsonModel = this.getOwnerComponent().getModel("jsonModel");
			var temreasonapply = sap.ui.core.Fragment.byId("adjustQty", "reasonapply");
			var sReasonText = "";
			if (temreasonapply.getSelectedItem()) {
				var sReasonText = temreasonapply.getSelectedItem().getText();
			}
			var batches = jsonModel.getProperty("/batches");
			var temREASON = jsonModel.getProperty("/temREASON");
			var temNOTES = jsonModel.getProperty("/temNOTES");
			$.each(batches, function (i, e) {
				e.NOTES = temNOTES;
				e.REASON = temREASON;
			});
			jsonModel.setProperty("/batches", batches);
		},
		onConfirmAdjust: function () {
			var jsonModel = this.getOwnerComponent().getModel("jsonModel");
			var cDate = this.convertUTCDate(new Date());
			var metrcData = jsonModel.getProperty("/metrcData");
			var batches = jsonModel.getProperty("/batches");
			var that = this;
			var metricPayload = [];
			var metrcPayLoadObj;
			var isValidated = true;
			$.each(batches, function (i, sObj) {
				if (sObj.AQTY === "") {
					sap.m.MessageToast.show("Please enter adjust quantity");
					isValidated = false;
					return;
				}
				if (sObj.REASON === "") {
					sap.m.MessageToast.show("Please select reason");
					isValidated = false;
					return;
				}
				if (sObj.NOTES === "") {
					sap.m.MessageToast.show("Please enter notes");
					isValidated = false;
					return;
				}
			});
			if (isValidated) {
				if (metrcData && metrcData.U_NACST === "X") {
					var itemCodeList;
					$.each(batches, function (i, updateObject) {
						metrcPayLoadObj = {
							Label: updateObject.BatchNum,
							Quantity: Number(updateObject.AQTY),
							UnitOfMeasure: updateObject.UOMCode,
							AdjustmentReason: updateObject.REASON,
							AdjustmentDate: that.getSystemDate(),
							ReasonNote: updateObject.NOTES
						};
						metricPayload.push(metrcPayLoadObj);
					});
				}
				this._busyDialog.open();
				jsonModel.setProperty("/busyTitle", "Hang tight...");
				jsonModel.setProperty(
					"/busyText",
					"We’re working on Adjust. Please keep this page open until we’re done."
				);
				if (metrcData && metrcData.U_NACST === "X") {
					var metrcUrl = "/packages/v2/adjust?licenseNumber=" + jsonModel.getProperty("/selectedLicense");
					that.callMetricsService(metrcUrl, "POST", metricPayload, function () {
						sap.m.MessageToast.show("METRC sync completed successfully");
						that.AdjusttoTable(batches, that);
					}, function (error) {
						that._busyDialog.close();
						sap.m.MessageToast.show(JSON.stringify(error));
					});
				} else {
					that.AdjusttoTable(batches, that);
				}
			}
		},
		AdjusttoTable: function (batches, that) {
			var jsonModel = this.getOwnerComponent().getModel("jsonModel");
			var count = batches.length;
			$.each(batches, function (i, sObj) {
				var AbslocationEntry, BinCode, ProdStdCost;
				var allItemList = jsonModel.getProperty("/allItemList");
				$.each(allItemList, function (i, obj) {
					if (sObj.ItemCode == obj.ItemCode) {
						ProdStdCost = obj.ProdStdCost;
					}
				});
				var ChangeLocationList = jsonModel.getProperty("/ChangeLocationList");
				$.each(ChangeLocationList, function (i, obj) {
					if (sObj.BinLocationCode.toLowerCase() == obj.BinCode.toLowerCase()) {
						AbslocationEntry = obj.AbsEntry;
						BinCode = obj.BinCode;
					}
				});
				var payLoadInventoryExit = {
					"BPL_IDAssignedToInvoice": jsonModel.getProperty("/sLinObj").U_Branch,
					"Comments": "Immature Plants - Adjust",
					"DocumentLines": []
				};
				var adjustedQty = Number(sObj.AQTY);
				payLoadInventoryExit.DocumentLines.push({
					"ItemCode": sObj.ItemCode,
					"CostingCode": "PROC",
					"ItmGrpCode": 100,
					"WarehouseCode": sObj.WhsCode,
					"Quantity": Math.abs(adjustedQty),
					"BatchNumbers": [{
						"BatchNumber": sObj.BatchNum, // <THIS IS TAG>
						"Quantity": Math.abs(adjustedQty), //<THIS IS THE QTY OF CLONES>
						"Location": BinCode //<THIS IS FROM CLONE ROOM>
					}],
					"DocumentLinesBinAllocations": [{
						"BinAbsEntry": Number(AbslocationEntry),
						"Quantity": Math.abs(adjustedQty),
						"SerialAndBatchNumbersBaseLine": 0
					}]
				});

				var payLoadInventoryEntry = {
					"BPL_IDAssignedToInvoice": jsonModel.getProperty("/sLinObj").U_Branch,
					"Comments": "Immature Plants - Adjust",
					"DocumentLines": []
				};
				payLoadInventoryEntry.DocumentLines.push({
					"ItemCode": sObj.ItemCode,
					"CostingCode": "PROC",
					"ItmGrpCode": 100,
					"WarehouseCode": sObj.WhsCode,
					"Quantity": adjustedQty,
					"UnitPrice": Number(ProdStdCost),
					"BatchNumbers": [{
						"BatchNumber": sObj.BatchNum, // <THIS IS TAG>
						"Quantity": adjustedQty, //<THIS IS THE QTY OF CLONES>
						"Location": BinCode //<THIS IS FROM CLONE ROOM>
					}],
					"DocumentLinesBinAllocations": [{
						"BinAbsEntry": Number(AbslocationEntry),
						"Quantity": adjustedQty,
						"SerialAndBatchNumbersBaseLine": 0
					}]
				});
				if (Number(sObj.AQTY) + Number(sObj.Quantity) >= 0) {
					if (adjustedQty < 0) {
						that.updateServiecLayer("/b1s/v2/InventoryGenExits", function (resExit, sDataExit) {
							count--;
							if (count == 0) {
								that.loadMasterData();
								that.adjustQtyDialog.close();
								jsonModel.setProperty("/busyTitle", "✅ All set!");
								jsonModel.setProperty("/busyText", "Adjust completed successfully.");
								setTimeout(function () {
									that._busyDialog.close();
								}, 1000);

								sap.m.MessageToast.show("Package(s) adjusted successfully");
								that.getView().byId("clonePlannerTable").clearSelection();
							}
						}, payLoadInventoryExit, "POST");
					} else {
						that.updateServiecLayer("/b1s/v2/InventoryGenEntries", function (resEntry, sDataEntry) {
							count--;
							if (count == 0) {
								that.loadMasterData();
								that.adjustQtyDialog.close();
								jsonModel.setProperty("/busyTitle", "✅ All set!");
								jsonModel.setProperty("/busyText", "Adjust completed successfully.");
								setTimeout(function () {
									that._busyDialog.close();
								}, 1000);
								that.getView().byId("clonePlannerTable").clearSelection();
							}
						}, payLoadInventoryEntry, "POST");
					}
				} else {
					sap.m.MessageToast.show("Adjust quantity is less than available quantity");
				}
			});
		},
		onAdjustClose: function () {
			this.adjustQtyDialog.close();
		},
		/** code for adjust end**/

		/** code for finish start**/
		handleFinish: function (evt) {
				var jsonModel = this.getOwnerComponent().getModel("jsonModel");
				var sItems;
				var clonePlannerTable = this.getView().byId("clonePlannerTable");
				sItems = clonePlannerTable.getSelectedIndices();
				var metrcData = jsonModel.getProperty("/metrcData");
				var that = this;
				var metricPayload = [];
				var updateArray = [];
				var metrcPayLoadObj;
				this.getView().setBusy(true);
				$.each(sItems, function (i, e) {
					var updateObject;
					updateObject = clonePlannerTable.getContextByIndex(e).getObject();
					if (updateObject.Quantity === 0) {
						updateArray.push(updateObject);
						metrcPayLoadObj = {
							Label: updateObject.BatchNum,
							ActualDate: updateObject.CreateDate
						};
						metricPayload.push(metrcPayLoadObj);
					}
				});
				var uploadPayLoad = {
					"Status": "bdsStatus_NotAccessible"
				};
				if (sItems.length > 0) {
					if (updateArray.length > 0) {
						var count = updateArray.length;
						that.getView().setBusy(true);
						if (metrcData && metrcData.U_NACST === "X") {
							var metrcUrl = "/packages/v2/finish?licenseNumber=" + jsonModel.getProperty("/selectedLicense");
							that.callMetricsService(metrcUrl, "PUT", metricPayload, function () {
								sap.m.MessageToast.show("METRC sync completed successfully");
								$.each(updateArray, function (i, e) {
									that.updateServiecLayer("/b1s/v2/BatchNumberDetails(" + e.BatchAbsEntry + ")", function () {
										count--;
										if (count == 0) {
											that.getView().setBusy(false);
											that.getView().byId("clonePlannerTable").clearSelection();
											that.loadMasterData();
										}
									}, uploadPayLoad, "PATCH");
									that.getView().setBusy(false);
								});
							}, function (error) {
								that.getView().setBusy(false);
								sap.m.MessageToast.show(JSON.stringify(error));
							});
						} else {
							$.each(updateArray, function (i, e) {
								that.updateServiecLayer("/b1s/v2/BatchNumberDetails(" + e.BatchAbsEntry + ")", function () {
									count--;
									if (count == 0) {
										that.getView().setBusy(false);
										that.getView().byId("clonePlannerTable").clearSelection();
										that.loadMasterData();
									}
								}, uploadPayLoad, "PATCH");
								that.getView().setBusy(false);
							});
						}
					} else {
						that.getView().setBusy(false);
						sap.m.MessageToast.show("Please select batches with quantity '0'");
					}
				} else {
					that.getView().setBusy(false);
					sap.m.MessageToast.show("Please select atleast one batch");
				}
			}
			/** code for finish end**/

	});
});