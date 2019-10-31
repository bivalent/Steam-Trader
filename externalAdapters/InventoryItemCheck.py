from botocore.vendored import requests
import uuid
import json
import time

def cl_steam_inventory_handler(event, context):
    resp = False
    print(event)
    requestBody = dict()
    if ("body" in event):
        requestBody = event["body"]
    else:
        requestBody = event

    if (isinstance(requestBody, str)):
        requestBody = json.loads(requestBody)

    item_found_resp = steam_inventory_adapter(requestBody)

    # normal response
    error = item_found_resp["error"]
    status = item_found_resp["status"]

    adapterData = {
        "item_found": item_found_resp["item_found"]
    }

    respBodyJson = {
        "jobRunID": requestBody["id"],
        "status": item_found_resp["status"],
        "data": adapterData,
        "error": item_found_resp["error"],
        "pending": False
    }

    responsePayload = {
        "statusCode": 200,
        "statusDescription": "200 OK",
        "isBase64Encoded": False,
        "headers": {
            "Content-Type": "application/json"
        },
        "body": json.dumps(respBodyJson)
    }
    print(responsePayload)
    return responsePayload


def steam_inventory_adapter(request):
    job_id = request['id']
    data = request['data']

    user_id = data['user_id']
    appid = data['appid']
    context = data['context']
    item = data['item']

    assetid = item['assetid']
    classid = item['classid']
    instanceid = item['instanceid']

    steam_inventory_url = "http://steamcommunity.com/inventory/{0}/{1}/{2}?count=5000".format(user_id, appid, context)
    item_found_resp = is_item_in_inventory(steam_inventory_url, assetid, classid, instanceid)
    return item_found_resp

# PRE: Take URL and item information.
# POST: {   "item_found": T/F,
#            "status": "completed"/"errored"
#           "error": None/Error message
#           "error_code":
#       }
# NOTES: This handles the URL calls and REST operations.
# >> search_for_item_in_payload does the actual search
def is_item_in_inventory(url, assetid, classid, instanceid):
    more_items = 1 # steam returns 'more_items: 1 when there are more items. also 'last_asset' too.
    item_found = False
    full_url = url
    rateLimitedCount = 0
    # paginate
    while more_items == 1 and not item_found:
        print(full_url)
        response = requests.get(full_url)
        r_steaminventory = response.json()

        # response __bool__ evals to >=200 and < 400
        if(response and r_steaminventory['total_inventory_count'] > 0):
            item_found = search_for_item_in_payload(assetid, classid, instanceid, r_steaminventory)
            if item_found:
                print("Item Found!")
                return {
                    "item_found": item_found,
                    "status": "completed",
                    "error": None,
                    "error_code": None
                }
            #prepare for next iteration
            elif 'more_items' in r_steaminventory:
                more_items = r_steaminventory['more_items']
                last_assetid = r_steaminventory['last_assetid']
            else:
                more_items = 0
                last_assetid = None

            full_url = f"{url}?last_assetid={last_assetid}"
        elif (response and 'total_inventory_count' in r_steaminventory and r_steaminventory['total_inventory_count'] == 0):
            return {
                    "item_found": item_found,
                    "status": "errored",
                    "error": "Call was successful but no items found. Check correct appId and context were used.",
                    "error_code": None
                }
        # 429 = rate-limited. we want to retry in that case, after a short pause
        elif (not response and response.status_code == 429):
            print("Rate limited")
            if rateLimitedCount < 4:
                time.sleep(30)
                rateLimitedCount += 1
            else:
                return {
                    "item_found": item_found,
                    "status": "errored",
                    "error": "Call failed due to rate-limiting from steam. Try again later.",
                    "error_code": 429
                }
        else:
            print(f"Steam call failed with HttpErrorCode: {response.status_code} and message: {response.json()}")
            return {
                    "item_found": item_found,
                    "status": "errored",
                    "error": f"Call failed with httpCode: {response.status_code}",
                    "error_code": response.status_code
                }
    # item not found after all successful calls
    return {
                "item_found": item_found,
                "status": "completed",
                "error": None,
                "error_code": None
            }
# PRE: Take item info and payload.
# Description: searches the payload and...
# POST: returns T/F if it was found
def search_for_item_in_payload(assetid, classid, instanceid, payload):
    r_steaminventory = payload
    item_found=False
    # start processing of asset l==t
    assets = r_steaminventory['assets']
    assets_searched = 0
    for asset in assets:
        assets_searched += 1
        if (str(asset['assetid']) == str(assetid)
            and str(asset['classid']) == str(classid)
            and str(asset['instanceid']) == str(instanceid)):
            item_found = True
            print(f"Item Found! Assets searched: {assets_searched}")
            break

    return item_found
